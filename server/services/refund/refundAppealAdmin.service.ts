import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { db } from "@/server/db";
import type { RefundCondition } from "@/server/entities/refund/refund.dto";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { refundAppealRepository } from "@/server/repositories/refundAppeal.repository";
import { refundAuditRepository } from "@/server/repositories/refundAudit.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { withPayoutRunLock } from "@/server/services/payments/payoutRunLock";
import { logger } from "@/server/utils/logger";
import { isAutoApprovable } from "./appealRules";
import { type AcceptedEvidence, validateEvidence } from "./evidenceFiles";
import {
	AppealApproveBlockedError,
	EvidenceStorageMissingError,
	RefundAppealConflictError,
	RefundAppealInputError,
	RefundAppealNotFoundError,
	RefundExceptionError,
} from "./refund.errors";
import { type RefundStatus, refundService } from "./refund.service";
import { refundEffectsService } from "./refundEffects.service";
import { refundEvidenceStorage } from "./refundEvidenceStorage";
import { isDisputeBlocking } from "./refundFacts";
import { refundNotificationsService } from "./refundNotifications.service";
import { REFUND_WINDOW_MS } from "./refundRules";

const DAY_MS = 24 * 60 * 60 * 1000;

/** V11: a bounded batch per daily run; the rest follows the next day. */
const OVERDUE_BATCH = 50;

const denialReason = z
	.string()
	.trim()
	.min(1, "A denial needs a reason")
	.max(2000)
	.refine((v) => !v.includes("\u0000"), "Invalid character");

export type ApproveBlocker = "certificate" | "dispute" | null;

export type OpenAppealView = {
	appealId: string;
	paymentId: string;
	courseTitle: string;
	studentName: string;
	kind: "direct" | "after_denial";
	exceededCondition: RefundCondition;
	reason: string;
	text: string;
	filedAt: Date;
	deadlineAt: Date;
	daysLeft: number;
	snapshot: Record<string, unknown>;
	files: { id: string; fileName: string; uploadedBy: "student" | "admin" }[];
	approveBlockedBy: ApproveBlocker;
};

const blockerOf = async (
	tx: Prisma.TransactionClient,
	request: {
		studentId: string;
		courseId: string;
		payment: { disputeState: Parameters<typeof isDisputeBlocking>[0] };
	},
): Promise<ApproveBlocker> => {
	if (
		await refundRequestRepository.hasCertificate(
			tx,
			request.studentId,
			request.courseId,
		)
	)
		return "certificate";
	if (isDisputeBlocking(request.payment.disputeState)) return "dispute";
	return null;
};

class RefundAppealAdminService {
	/** FR-A1: the queue — oldest first, with the snapshot, days left and what blocks approval. */
	async listOpenAppeals(now: Date = new Date()): Promise<OpenAppealView[]> {
		const appeals = await refundAppealRepository.listOpen();
		return Promise.all(
			appeals.map(async (a) => ({
				appealId: a.id,
				paymentId: a.request.paymentId,
				courseTitle: a.request.course.title,
				studentName: a.request.student.name,
				kind: a.kind,
				exceededCondition: a.exceededCondition as RefundCondition,
				reason: a.reason,
				text: a.text,
				filedAt: a.createdAt,
				deadlineAt: a.deadlineAt,
				daysLeft: Math.max(
					0,
					Math.ceil((a.deadlineAt.getTime() - now.getTime()) / DAY_MS),
				),
				snapshot: (a.request.snapshot ?? {}) as Record<string, unknown>,
				files: a.files,
				approveBlockedBy: await blockerOf(db, a.request),
			})),
		);
	}

	/**
	 * FR-A2, A3 (V13): approves an open appeal — refused while a certificate or a dispute exists;
	 * the appeal, the request's approval and one audit row change together; then the refund runs on
	 * the ordinary path (retries, day-3 emails, effects).
	 */
	async approveAppeal(
		adminId: string,
		appealId: string,
		now: Date = new Date(),
	): Promise<{ refundStatus: RefundStatus }> {
		const requestId = await db.$transaction(async (tx) => {
			const appeal = await refundAppealRepository.findForDecision(tx, appealId);
			if (!appeal) throw new RefundAppealNotFoundError();
			if (appeal.status !== "open")
				throw new RefundAppealConflictError("This appeal was already decided.");
			const blocker = await blockerOf(tx, appeal.request);
			if (blocker) throw new AppealApproveBlockedError(blocker);
			const closed = await refundAppealRepository.closeInTx(tx, appealId, {
				status: "approved",
				decidedBy: adminId,
				decidedAt: now,
			});
			if (!closed)
				throw new RefundAppealConflictError("This appeal was already decided.");
			await refundRequestRepository.approveInTx(
				tx,
				appeal.request.id,
				"appeal",
				now,
			);
			await refundAuditRepository.createInTx(tx, {
				kind: "appeal_approved",
				paymentId: appeal.request.paymentId,
				appealId,
				adminId,
			});
			return appeal.request.id;
		});
		await this.tellStudent(appealId);
		return { refundStatus: await refundService.executeRefund(requestId, now) };
	}

	/**
	 * FR-A2, A3 (V13): denies an open appeal with a written reason and 0–3 files (checked like the
	 * student's, stored privately); final, with one audit row.
	 */
	async denyAppeal(
		adminId: string,
		appealId: string,
		input: { reason: string; files: File[] },
		now: Date = new Date(),
	): Promise<void> {
		const parsed = denialReason.safeParse(input.reason);
		if (!parsed.success)
			throw new RefundAppealInputError(
				parsed.error.issues[0]?.message ?? "Invalid reason",
			);
		const evidence = await validateEvidence(input.files);
		if (evidence.length > 0 && !refundEvidenceStorage.isConfigured())
			throw new EvidenceStorageMissingError();

		const uploaded: { pathname: string; evidence: AcceptedEvidence }[] = [];
		try {
			for (const item of evidence)
				uploaded.push({
					evidence: item,
					pathname: await refundEvidenceStorage.put(
						item.file,
						item.contentType,
					),
				});
			await db.$transaction(async (tx) => {
				const appeal = await refundAppealRepository.findForDecision(
					tx,
					appealId,
				);
				if (!appeal) throw new RefundAppealNotFoundError();
				const closed = await refundAppealRepository.closeInTx(tx, appealId, {
					status: "denied",
					decidedBy: adminId,
					decidedAt: now,
					denialReason: parsed.data,
				});
				if (!closed)
					throw new RefundAppealConflictError(
						"This appeal was already decided.",
					);
				await refundAppealRepository.createFilesInTx(
					tx,
					uploaded.map((u) => ({
						appealId,
						uploadedBy: "admin" as const,
						blobPathname: u.pathname,
						fileName: u.evidence.file.name.slice(0, 255) || "file",
						contentType: u.evidence.contentType,
						sizeBytes: u.evidence.file.size,
					})),
				);
				await refundAuditRepository.createInTx(tx, {
					kind: "appeal_denied",
					paymentId: appeal.request.paymentId,
					appealId,
					adminId,
					reason: parsed.data,
				});
			});
		} catch (error) {
			await refundEvidenceStorage
				.del(uploaded.map((u) => u.pathname))
				.catch((delError) =>
					logger.error("Could not delete files of a failed denial", {
						delError,
					}),
				);
			throw error;
		}
		await this.tellStudent(appealId);
	}

	/**
	 * FR-A5 / AC-C11 (V11): on day 14 an open appeal that followed an automatic denial for a
	 * condition other than the threshold or the account limit is approved — no admin, audited
	 * `appeal_overdue` — and refunded. Called by the daily payout job under its run lock, before the
	 * release. Returns how many it approved.
	 */
	async approveOverdueAppeals(now: Date): Promise<number> {
		const open = await refundAppealRepository.findOverdueCandidates(
			new Date(now.getTime() - REFUND_WINDOW_MS),
			OVERDUE_BATCH,
		);
		let approved = 0;
		for (const appeal of open) {
			const due = isAutoApprovable(
				{
					status: appeal.status,
					kind: appeal.kind,
					exceededCondition: appeal.exceededCondition,
					paidAt: appeal.request.payment.paidAt,
					failedConditions: appeal.request.failedConditions,
				},
				now,
			);
			if (!due) continue;
			const closed = await db.$transaction(async (tx) => {
				// Audit M-1 / EC-10: the same re-check as a manual approval; a blocked appeal stays
				// open for the admin (the queue shows why) and keeps being reminded.
				if (await blockerOf(tx, appeal.request)) return false;
				const won = await refundAppealRepository.closeInTx(tx, appeal.id, {
					status: "overdue_approved",
					decidedBy: null,
					decidedAt: now,
				});
				if (!won) return false;
				await refundRequestRepository.approveInTx(
					tx,
					appeal.request.id,
					"overdue",
					now,
				);
				await refundAuditRepository.createInTx(tx, {
					kind: "appeal_overdue",
					paymentId: appeal.request.paymentId,
					appealId: appeal.id,
				});
				return true;
			});
			if (!closed) continue;
			approved++;
			await this.tellStudent(appeal.id);
			await refundService.executeRefund(appeal.request.id, now);
		}
		return approved;
	}

	/**
	 * FR-A6 / AC-F10 (V14): refunds any succeeded payment with a written reason, under the payout
	 * run lock. Refused while an appeal is open or a refund is processing on it. The audit row is
	 * written first — it is the record that Stripe's own webhook for this refund belongs to the
	 * exception — and only once, so a retry after a Stripe failure does not add another. No
	 * `refund_requests` row: an exception counts for neither D3 nor the account limit.
	 */
	async refundException(
		adminId: string,
		input: { paymentId: string; reason: string },
		now: Date = new Date(),
	): Promise<{ status: "refunded" | "already_refunded" }> {
		const reason = denialReason.safeParse(input.reason);
		if (!reason.success)
			throw new RefundExceptionError(
				"An exception needs a reason",
				"BAD_REQUEST",
			);

		return withPayoutRunLock(async () => {
			const payment = await paymentRepository.findForException(input.paymentId);
			if (
				!payment ||
				(payment.status !== "succeeded" && payment.status !== "refunded")
			)
				throw new RefundExceptionError("Payment not found", "NOT_FOUND");
			if (payment.status === "refunded")
				return { status: "already_refunded" as const };
			if (payment.refundRequest?.appeal?.status === "open")
				throw new RefundExceptionError(
					"An appeal is open on this payment; decide the appeal instead.",
					"CONFLICT",
				);
			if (payment.refundRequest?.refundState === "processing")
				throw new RefundExceptionError(
					"A refund is already processing for this payment.",
					"CONFLICT",
				);
			if (isDisputeBlocking(payment.disputeState))
				throw new RefundExceptionError(
					"A dispute about this payment is open with the bank.",
					"PRECONDITION_FAILED",
				);
			if (!payment.stripePaymentIntentId)
				throw new RefundExceptionError(
					"This payment has no Stripe charge.",
					"PRECONDITION_FAILED",
				);

			if (!(await refundAuditRepository.hasException(db, payment.id)))
				await refundAuditRepository.createInTx(db, {
					kind: "exception",
					paymentId: payment.id,
					adminId,
					reason: reason.data,
				});
			await refundService.refundAtStripe({
				paymentId: payment.id,
				stripePaymentIntentId: payment.stripePaymentIntentId,
				disputeState: payment.disputeState,
			});
			await refundEffectsService.apply({
				paymentId: payment.id,
				path: "admin_exception",
				now,
			});
			return { status: "refunded" as const };
		});
	}

	/** FR-A7 (V15): the "needs review" list. */
	async listNeedsReview() {
		const rows = await paymentRepository.findNeedsReview();
		return rows.map((p) => ({
			paymentId: p.id,
			courseTitle: p.course.title,
			studentName: p.student.name,
			amountCents: p.amountCents,
			currency: p.currency,
			fullyRefunded: p.status === "refunded",
			flaggedAt: p.needsReviewAt,
		}));
	}

	async markReviewed(paymentId: string): Promise<void> {
		await paymentRepository.clearNeedsReview(paymentId);
	}

	private async tellStudent(appealId: string): Promise<void> {
		await refundNotificationsService
			.appealDecided(appealId)
			.catch((error) =>
				logger.error("Appeal-decided email failed", { appealId, error }),
			);
	}
}

export const refundAppealAdminService = new RefundAppealAdminService();
