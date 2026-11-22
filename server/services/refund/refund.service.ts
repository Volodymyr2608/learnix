import Stripe from "stripe";
import { Prisma, type RefundDecision } from "@/generated/prisma";
import { db } from "@/server/db";
import type {
	RefundCondition,
	RefundRequestInput,
} from "@/server/entities/refund/refund.dto";
import { openedLessonRepository } from "@/server/repositories/openedLesson.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { stripe } from "@/server/services/payments/stripe.client";
import {
	RefundAlreadyRequestedError,
	RefundNotFoundError,
} from "./refund.errors";
import { refundEffectsService } from "./refundEffects.service";
import { isStudentRefundEnabled } from "./refundFlag";
import { accountLimitSince, decideRefund } from "./refundRules";

/** FR-S20: what the student is told about an approved refund — never Stripe's text. */
export type RefundStatus = "refunded" | "processing";

export type RefundRequestResult = {
	requestId: string;
	decision: RefundDecision;
	failedConditions: RefundCondition[];
	/** Set for an approved request. */
	refundStatus?: RefundStatus;
};

const isUniqueViolation = (error: unknown): boolean =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === "P2002";

class RefundService {
	/**
	 * FR-S5/S6/S14: re-checks every FR-S2 condition at submission and stores the
	 * request with its snapshot. An approved request is refunded at once, after the
	 * request transaction commits — no network call runs under the per-student lock.
	 */
	async requestRefund(
		studentId: string,
		input: RefundRequestInput,
	): Promise<RefundRequestResult> {
		if (!isStudentRefundEnabled()) throw new RefundNotFoundError();

		try {
			// db.$transaction, not BaseRepository.transaction: the latter wraps every
			// error into a plain Error, losing the NOT_FOUND / CONFLICT codes.
			const created = await db.$transaction(async (tx) => {
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
				// Refunded another way (the Dashboard): nothing left to request (FR-S10).
				if (payment.status !== "succeeded") {
					throw new RefundNotFoundError();
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
						accountLimitSince(now),
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
					refundState:
						result.decision === "auto_approved" ? "processing" : null,
				});

				return {
					requestId: row.id,
					decision: result.decision,
					failedConditions: result.failedConditions,
				};
			});
			if (created.decision !== "auto_approved") return created;
			const refundStatus = await this.executeRefund(
				created.requestId,
				new Date(),
			);
			return { ...created, refundStatus };
		} catch (error) {
			// Backstop for FR-S7: the unique key on payment_id, raised by `tx`
			// directly (base-repository methods would have wrapped it).
			if (isUniqueViolation(error))
				throw new RefundAlreadyRequestedError(error);
			throw error;
		}
	}

	/**
	 * FR-S6 / FR-S20 — makes the Stripe refund for an approved request, then applies its
	 * effects. Retried by the daily job while the request stays `processing`.
	 * - a disputed charge is never refunded (C12, R3);
	 * - refunds for the payment intent are listed first (idempotency keys expire, C7);
	 * - `refunds.create` gets only the stored payment intent: no amount, nothing from the
	 *   client (C2); `charge_already_refunded` is success (C3).
	 */
	async executeRefund(requestId: string, now: Date): Promise<RefundStatus> {
		const request = await refundRequestRepository.findForRefund(requestId);
		if (!request || request.refundState !== "processing") return "refunded";
		const { id: paymentId, stripePaymentIntentId } = request.payment;
		if (!stripePaymentIntentId) {
			await refundRequestRepository.recordRefundError(
				requestId,
				"no payment intent",
			);
			return "processing";
		}

		try {
			const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId, {
				expand: ["latest_charge"],
			});
			const charge =
				typeof pi.latest_charge === "object" ? pi.latest_charge : null;
			if (charge?.disputed) {
				await refundRequestRepository.recordRefundError(
					requestId,
					"charge disputed",
				);
				return "processing";
			}

			const existing = await stripe.refunds.list({
				payment_intent: stripePaymentIntentId,
				limit: 10,
			});
			const done = existing.data.find(
				(r) => r.status === "succeeded" || r.status === "pending",
			);
			const refundId = done
				? done.id
				: await this.createStripeRefund(paymentId, stripePaymentIntentId);
			await refundRequestRepository.recordStripeRefund(requestId, refundId);
		} catch (error) {
			await refundRequestRepository.recordRefundError(
				requestId,
				error instanceof Error ? error.message : String(error),
			);
			return "processing";
		}

		const applied = await refundEffectsService.apply({
			paymentId,
			path: "refund_request",
			now,
		});
		// Another path (the webhook, the replay) already applied them; the request is done.
		if (!applied) await refundRequestRepository.markRefunded(requestId, now);
		return "refunded";
	}

	/** C2 + C3: returns the Stripe refund id, or null when Stripe says it was already refunded. */
	private async createStripeRefund(
		paymentId: string,
		paymentIntentId: string,
	): Promise<string | null> {
		try {
			const refund = await stripe.refunds.create(
				{ payment_intent: paymentIntentId },
				{ idempotencyKey: `refund:${paymentId}` },
			);
			return refund.id;
		} catch (error) {
			if (
				error instanceof Stripe.errors.StripeError &&
				error.code === "charge_already_refunded"
			) {
				return null;
			}
			throw error;
		}
	}
}

export const refundService = new RefundService();
