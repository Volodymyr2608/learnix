import { Prisma, type RefundDecision } from "@/generated/prisma";
import { db } from "@/server/db";
import type {
	RefundCondition,
	RefundRequestInput,
} from "@/server/entities/refund/refund.dto";
import { openedLessonRepository } from "@/server/repositories/openedLesson.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import {
	RefundAlreadyRequestedError,
	RefundNotFoundError,
} from "./refund.errors";
import { isStudentRefundEnabled } from "./refundFlag";
import { decideRefund } from "./refundRules";

const ACCOUNT_LIMIT_PERIOD_MS = 365 * 24 * 60 * 60 * 1000;

export type RefundRequestResult = {
	requestId: string;
	decision: RefundDecision;
	failedConditions: RefundCondition[];
};

const isUniqueViolation = (error: unknown): boolean =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === "P2002";

class RefundService {
	/**
	 * FR-S5/S6/S14: re-checks every FR-S2 condition at submission and stores the
	 * request with its snapshot. No Stripe call in this slice (P1).
	 */
	async requestRefund(
		studentId: string,
		input: RefundRequestInput,
	): Promise<RefundRequestResult> {
		if (!isStudentRefundEnabled()) throw new RefundNotFoundError();

		try {
			// db.$transaction, not BaseRepository.transaction: the latter wraps every
			// error into a plain Error, losing the NOT_FOUND / CONFLICT codes.
			return await db.$transaction(async (tx) => {
				await refundRequestRepository.lockStudent(tx, studentId);

				const payment = await refundRequestRepository.findRequestablePayment(
					tx,
					input.paymentId,
					studentId,
				);
				if (!payment) throw new RefundNotFoundError();

				if (await refundRequestRepository.existsForPayment(tx, payment.id)) {
					throw new RefundAlreadyRequestedError();
				}

				const now = new Date();
				const [
					counts,
					hasCertificate,
					hasEarlierCountingRefund,
					accountLimitRefunds12m,
				] = await Promise.all([
					openedLessonRepository.countCourseLessons(
						tx,
						studentId,
						payment.courseId,
					),
					refundRequestRepository.hasCertificate(
						tx,
						studentId,
						payment.courseId,
					),
					refundRequestRepository.hasCountingRefund(
						tx,
						studentId,
						payment.courseId,
					),
					refundRequestRepository.countAccountLimitRefunds(
						tx,
						studentId,
						new Date(now.getTime() - ACCOUNT_LIMIT_PERIOD_MS),
					),
				]);

				const result = decideRefund(
					{
						paidAt: payment.paidAt,
						...counts,
						hasCertificate,
						hasEarlierCountingRefund,
						accountLimitRefunds12m,
						// P2: no dispute state is stored until the disputes slice.
						hasOpenDispute: false,
					},
					now,
				);

				const row = await refundRequestRepository.createInTx(tx, {
					paymentId: payment.id,
					studentId,
					courseId: payment.courseId,
					reason: input.reason,
					text: input.text,
					decision: result.decision,
					failedConditions: result.failedConditions,
					snapshot: result.snapshot as Prisma.InputJsonValue,
				});

				return {
					requestId: row.id,
					decision: result.decision,
					failedConditions: result.failedConditions,
				};
			});
		} catch (error) {
			// Backstop for FR-S7: the unique key on payment_id, raised by `tx`
			// directly (base-repository methods would have wrapped it).
			if (isUniqueViolation(error))
				throw new RefundAlreadyRequestedError(error);
			throw error;
		}
	}
}

export const refundService = new RefundService();
