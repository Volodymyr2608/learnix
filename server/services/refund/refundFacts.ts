import type { DisputeState, Prisma } from "@/generated/prisma";
import type { RefundFacts } from "@/server/entities/refund/refund.dto";
import { openedLessonRepository } from "@/server/repositories/openedLesson.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { accountLimitSince } from "./refundRules";

/** FR-S2 / FR-P18a: a stored dispute blocks unless it was won (qa #2: lost-but-not-applied too). */
export const isDisputeBlocking = (disputeState: DisputeState | null): boolean =>
	disputeState !== null && disputeState !== "won";

/**
 * FR-S2 / FR-S5: every fact the rules read, from the caller's transaction — one definition for the
 * request, the refund page and the appeal, so the three can never judge the same purchase
 * differently.
 */
export const gatherRefundFacts = async (
	tx: Prisma.TransactionClient,
	studentId: string,
	payment: {
		courseId: string;
		paidAt: Date | null;
		disputeState: DisputeState | null;
	},
	now: Date,
): Promise<RefundFacts> => {
	const [
		counts,
		hasCertificate,
		hasEarlierCountingRefund,
		accountLimitRefunds12m,
	] = await Promise.all([
		openedLessonRepository.countCourseLessons(tx, studentId, payment.courseId),
		refundRequestRepository.hasCertificate(tx, studentId, payment.courseId),
		refundRequestRepository.hasCountingRefund(tx, studentId, payment.courseId),
		refundRequestRepository.countAccountLimitRefunds(
			tx,
			studentId,
			accountLimitSince(now),
		),
	]);
	return {
		paidAt: payment.paidAt,
		...counts,
		hasCertificate,
		hasEarlierCountingRefund,
		accountLimitRefunds12m,
		hasOpenDispute: isDisputeBlocking(payment.disputeState),
	};
};
