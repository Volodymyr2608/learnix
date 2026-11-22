import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { db } from "@/server/db";
import type { RefundCondition } from "@/server/entities/refund/refund.dto";
import { refundAppealRepository } from "@/server/repositories/refundAppeal.repository";
import { refundAuditRepository } from "@/server/repositories/refundAudit.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { logger } from "@/server/utils/logger";
import { type AcceptedEvidence, validateEvidence } from "./evidenceFiles";
import {
	AppealApproveBlockedError,
	EvidenceStorageMissingError,
	RefundAppealConflictError,
	RefundAppealInputError,
	RefundAppealNotFoundError,
} from "./refund.errors";
import { type RefundStatus, refundService } from "./refund.service";
import { refundEvidenceStorage } from "./refundEvidenceStorage";
import { isDisputeBlocking } from "./refundFacts";
import { refundNotificationsService } from "./refundNotifications.service";

const DAY_MS = 24 * 60 * 60 * 1000;

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

	private async tellStudent(appealId: string): Promise<void> {
		await refundNotificationsService
			.appealDecided(appealId)
			.catch((error) =>
				logger.error("Appeal-decided email failed", { appealId, error }),
			);
	}
}

export const refundAppealAdminService = new RefundAppealAdminService();
