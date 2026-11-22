import { Prisma } from "@/generated/prisma";
import { db } from "@/server/db";
import type { RefundCondition } from "@/server/entities/refund/refund.dto";
import { refundAppealInput } from "@/server/entities/refund/refund.dto";
import { refundAppealRepository } from "@/server/repositories/refundAppeal.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { checkRefundRequestRateLimit } from "@/server/services/_shared/aiLimits/checkRefundRequestRateLimit";
import { adminAlertService } from "@/server/services/payments/adminAlert.service";
import { logger } from "@/server/utils/logger";
import { appealDeadline } from "./appealRules";
import { type AcceptedEvidence, validateEvidence } from "./evidenceFiles";
import {
	EvidenceStorageMissingError,
	RefundAppealConflictError,
	RefundAppealInputError,
	RefundBusyError,
	RefundNotFoundError,
} from "./refund.errors";
import { refundEvidenceStorage } from "./refundEvidenceStorage";
import { gatherRefundFacts } from "./refundFacts";
import { isStudentRefundEnabled } from "./refundFlag";
import { decideRefund } from "./refundRules";

/** FR-S13: a direct appeal is only for these two; any other failed condition is final. */
const APPEALABLE_DIRECTLY = new Set<RefundCondition>([
	"threshold",
	"account_limit",
]);

const isLockTimeout = (error: unknown): boolean =>
	/55P03|lock timeout/i.test(String((error as Error)?.message ?? error));

const isUniqueViolation = (error: unknown): boolean =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === "P2002";

type Uploaded = { pathname: string; evidence: AcceptedEvidence };

class RefundAppealService {
	/**
	 * FR-S13–S16 (V8, V9): files one appeal for the session's own purchase — a direct appeal while
	 * only the threshold or the account limit stands in the way, or an appeal after an automatic
	 * denial before its deadline. The text and files arrive in one request; files are checked by
	 * content, stored privately before the transaction, and deleted again if it fails.
	 */
	async fileAppeal(
		studentId: string,
		raw: {
			paymentId: string;
			reason: string;
			text: string;
			files: File[];
		},
		now: Date = new Date(),
	): Promise<{ appealId: string }> {
		if (!isStudentRefundEnabled()) throw new RefundNotFoundError();
		const parsed = refundAppealInput.safeParse({
			paymentId: raw.paymentId,
			reason: raw.reason,
			text: raw.text,
		});
		if (!parsed.success)
			throw new RefundAppealInputError(
				parsed.error.issues[0]?.message ?? "Invalid appeal",
			);
		const input = parsed.data;
		if (!(await checkRefundRequestRateLimit(studentId)))
			throw new RefundBusyError();

		const evidence = await validateEvidence(raw.files);
		if (evidence.length > 0 && !refundEvidenceStorage.isConfigured())
			throw new EvidenceStorageMissingError();

		// Read-only pre-check, so an ineligible appeal uploads nothing; the transaction re-checks.
		await db.$transaction((tx) =>
			this.decide(tx, studentId, input.paymentId, now),
		);

		const uploaded: Uploaded[] = [];
		try {
			for (const item of evidence)
				uploaded.push({
					evidence: item,
					pathname: await refundEvidenceStorage.put(
						item.file,
						item.contentType,
					),
				});

			const appealId = await db.$transaction(async (tx) => {
				await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '2s'`);
				await refundRequestRepository.lockStudent(tx, studentId);
				const plan = await this.decide(tx, studentId, input.paymentId, now);

				const requestId =
					plan.kind === "direct"
						? (
								await refundAppealRepository.createRequestInTx(tx, {
									paymentId: input.paymentId,
									studentId,
									courseId: plan.courseId,
									reason: input.reason,
									text: input.text,
									decision: "direct_appeal",
									failedConditions: plan.failedConditions,
									snapshot: plan.snapshot as Prisma.InputJsonValue,
								})
							).id
						: plan.requestId;

				const appeal = await refundAppealRepository.createAppealInTx(tx, {
					requestId,
					kind: plan.kind,
					exceededCondition: plan.exceededCondition,
					reason: input.reason,
					text: input.text,
					deadlineAt: plan.deadlineAt,
				});
				await refundAppealRepository.createFilesInTx(
					tx,
					uploaded.map((u) => ({
						appealId: appeal.id,
						uploadedBy: "student" as const,
						blobPathname: u.pathname,
						fileName: u.evidence.file.name.slice(0, 255) || "file",
						contentType: u.evidence.contentType,
						sizeBytes: u.evidence.file.size,
					})),
				);
				return appeal.id;
			});

			await adminAlertService
				.appealFiled(appealId)
				.catch((error) =>
					logger.error("Appeal-filed email failed", { appealId, error }),
				);
			return { appealId };
		} catch (error) {
			await refundEvidenceStorage
				.del(uploaded.map((u) => u.pathname))
				.catch((delError) =>
					logger.error("Could not delete evidence of a failed appeal", {
						delError,
					}),
				);
			if (isUniqueViolation(error))
				throw new RefundAppealConflictError("An appeal was already filed.");
			if (isLockTimeout(error)) throw new RefundBusyError(error);
			throw error;
		}
	}

	/** V9: which appeal this purchase allows right now, or why none. */
	private async decide(
		tx: Prisma.TransactionClient,
		studentId: string,
		paymentId: string,
		now: Date,
	) {
		const payment = await refundRequestRepository.findRequestablePayment(
			tx,
			paymentId,
			studentId,
		);
		if (!payment || payment.status !== "succeeded")
			throw new RefundNotFoundError();

		const request = await refundAppealRepository.findRequestForAppeal(
			tx,
			paymentId,
		);
		if (request) {
			if (request.appeal)
				throw new RefundAppealConflictError("An appeal was already filed.");
			if (request.decision !== "auto_denied")
				throw new RefundAppealConflictError("This request cannot be appealed.");
			const deadlineAt = appealDeadline({
				kind: "after_denial",
				paidAt: payment.paidAt,
				deniedAt: request.createdAt,
			});
			if (!deadlineAt || now >= deadlineAt)
				throw new RefundAppealConflictError("The appeal period has ended.");
			return {
				kind: "after_denial" as const,
				requestId: request.id,
				exceededCondition: request.failedConditions[0] ?? "window",
				deadlineAt,
			};
		}

		const result = decideRefund(
			await gatherRefundFacts(tx, studentId, payment, now),
			now,
		);
		if (result.failedConditions.length === 0)
			throw new RefundAppealConflictError(
				"This purchase can be refunded without an appeal.",
			);
		if (!result.failedConditions.every((c) => APPEALABLE_DIRECTLY.has(c)))
			throw new RefundAppealConflictError("This purchase cannot be appealed.");
		const deadlineAt = appealDeadline({
			kind: "direct",
			paidAt: payment.paidAt,
			deniedAt: null,
		});
		if (!deadlineAt)
			throw new RefundAppealConflictError("The appeal period has ended.");
		return {
			kind: "direct" as const,
			courseId: payment.courseId,
			failedConditions: result.failedConditions,
			snapshot: result.snapshot,
			exceededCondition: result.failedConditions[0] as RefundCondition,
			deadlineAt,
		};
	}
}

export const refundAppealService = new RefundAppealService();
