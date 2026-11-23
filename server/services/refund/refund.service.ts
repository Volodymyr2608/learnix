import Stripe from "stripe";
import {
	type DisputeState,
	Prisma,
	type RefundDecision,
} from "@/generated/prisma";
import { db } from "@/server/db";
import type {
	RefundCondition,
	RefundRequestInput,
} from "@/server/entities/refund/refund.dto";
import type { RefundPageState } from "@/server/entities/refund/refundView.dto";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { refundAppealRepository } from "@/server/repositories/refundAppeal.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { checkRefundRequestRateLimit } from "@/server/services/_shared/aiLimits/checkRefundRequestRateLimit";
import { stripe } from "@/server/services/payments/stripe.client";
import { logger } from "@/server/utils/logger";
import {
	ChargeDisputedError,
	RefundAlreadyRequestedError,
	RefundBusyError,
	RefundNotFoundError,
} from "./refund.errors";
import { refundEffectsService } from "./refundEffects.service";
import { gatherRefundFacts } from "./refundFacts";
import { isStudentRefundEnabled } from "./refundFlag";
import { refundNotificationsService } from "./refundNotifications.service";
import { decideRefund } from "./refundRules";
import { refundPageState } from "./refundView";

/** FR-S20: what the student is told about an approved refund — never Stripe's text. */
export type RefundStatus = "refunded" | "processing";

export type RefundRequestResult = {
	requestId: string;
	decision: RefundDecision;
	failedConditions: RefundCondition[];
	/** Set for an approved request. */
	refundStatus?: RefundStatus;
};

/** U9: Postgres `lock_not_available` (55P03) — the student lock stayed busy past `lock_timeout`. */
const isLockTimeout = (error: unknown): boolean =>
	/55P03|lock timeout/i.test(String((error as Error)?.message ?? error));

/** U9: how long a request waits for the student's refund lock before "try again". */
const LOCK_TIMEOUT = "2s";

const isUniqueViolation = (error: unknown): boolean =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === "P2002";

/** The admin-only text stored on the request (C23). */
const refundErrorText = (error: unknown): string => {
	if (error instanceof ChargeDisputedError) return "charge disputed";
	return error instanceof Error ? error.message : String(error);
};

class RefundService {
	/**
	 * EC-12 (W12): the courses whose open appeal an account deletion would close — for the
	 * deletion warning. Students only; nothing with the flag off.
	 */
	async openAppealCourses(userId: string, role: string): Promise<string[]> {
		if (!isStudentRefundEnabled() || role !== "STUDENT") return [];
		return refundAppealRepository.findOpenAppealCourseTitles(userId);
	}

	/**
	 * FR-S23 / AC-F7 (W9): a repurchase of a course the student already refunded in a counting way
	 * (an approved refund or a lost dispute) cannot be refunded again — the checkout says so. An
	 * exception, a Dashboard refund or a reversed one does not count, so it does not warn. Nothing
	 * with the flag off.
	 */
	async repurchaseWarning(
		studentId: string,
		courseId: string,
	): Promise<boolean> {
		if (!isStudentRefundEnabled()) return false;
		const counted = await refundRequestRepository.findCountingRefundCourseIds(
			studentId,
			[courseId],
		);
		return counted.has(courseId);
	}

	/**
	 * U5: what the refund page shows for the session's own payment. Flag off, another student's
	 * payment, or one that was never paid → the same NOT_FOUND (C1, C24). Read-only.
	 */
	async getRefundPage(
		studentId: string,
		paymentId: string,
		now: Date = new Date(),
	): Promise<{ courseTitle: string; state: RefundPageState }> {
		if (!isStudentRefundEnabled()) throw new RefundNotFoundError();

		const facts = await db.$transaction(async (tx) => {
			const payment = await refundRequestRepository.findForStudentView(
				tx,
				paymentId,
				studentId,
			);
			if (!payment) throw new RefundNotFoundError();

			const facts = await gatherRefundFacts(tx, studentId, payment, now);
			const request = payment.refundRequest;
			return {
				courseTitle: payment.course.title,
				...facts,
				paymentRefunded: payment.status === "refunded",
				// FR-P27 (qa #5): the page agrees with the "refund failed" email.
				refundFailedAtBank: payment.bankFailureAt !== null,
				// W3 / EC-19: after a partial Dashboard refund, only the remainder is left to refund.
				amountCents: payment.amountCents - (payment.refundedAmountCents ?? 0),
				currency: payment.currency,
				request: request
					? {
							...request,
							failedConditions: request.failedConditions as RefundCondition[],
						}
					: null,
			};
		});
		const { courseTitle, ...pageFacts } = facts;
		return { courseTitle, state: refundPageState(pageFacts, now) };
	}

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
		// U9: before any transaction, so a flood never reaches the connection pool.
		if (!(await checkRefundRequestRateLimit(studentId)))
			throw new RefundBusyError();

		try {
			// db.$transaction, not BaseRepository.transaction: the latter wraps every
			// error into a plain Error, losing the NOT_FOUND / CONFLICT codes.
			const created = await db.$transaction(async (tx) => {
				await tx.$executeRawUnsafe(
					`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`,
				);
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
				const result = decideRefund(
					await gatherRefundFacts(tx, studentId, payment, now),
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
					// V2: counts for D3 and the account limit.
					approval: result.decision === "auto_approved" ? "automatic" : null,
					approvedAt: result.decision === "auto_approved" ? now : null,
				});

				return {
					requestId: row.id,
					decision: result.decision,
					failedConditions: result.failedConditions,
				};
			});
			if (created.decision !== "auto_approved") {
				// U10: after commit; a failed email never fails the request.
				await refundNotificationsService
					.refundDenied(created.requestId, created.failedConditions)
					.catch((error) =>
						logger.error("Refund-denied email failed", {
							requestId: created.requestId,
							error,
						}),
					);
				return created;
			}
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
			if (isLockTimeout(error)) throw new RefundBusyError(error);
			throw error;
		}
	}

	async requestExists(requestId: string): Promise<boolean> {
		return (await refundRequestRepository.findForRefund(requestId)) !== null;
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
		await refundRequestRepository.markAttempt(requestId, now);
		const {
			id: paymentId,
			stripePaymentIntentId,
			disputeState,
		} = request.payment;
		if (!stripePaymentIntentId) {
			await refundRequestRepository.recordRefundError(
				requestId,
				"no payment intent",
			);
			return "processing";
		}

		try {
			const refundId = await this.refundAtStripe({
				paymentId,
				stripePaymentIntentId,
				disputeState,
			});
			await refundRequestRepository.recordStripeRefund(requestId, refundId);
		} catch (error) {
			await refundRequestRepository.recordRefundError(
				requestId,
				refundErrorText(error),
			);
			return "processing";
		}

		let applied: boolean;
		try {
			applied = await refundEffectsService.apply({
				paymentId,
				path: "refund_request",
				now,
			});
		} catch (error) {
			// qa #3: Stripe has refunded; the request stays processing and the daily retry lists
			// that refund and applies the effects again behind their compare-and-set.
			await refundRequestRepository.recordRefundError(
				requestId,
				`effects failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return "processing";
		}
		// Another path (the webhook, the replay) already applied them; the request is done.
		if (!applied) await refundRequestRepository.markRefunded(requestId, now);
		return "refunded";
	}

	/**
	 * C2, C3, C7, C12: makes sure Stripe refunded the whole charge — never on a disputed charge
	 * (throws `ChargeDisputedError`), listing existing refunds first (idempotency keys expire), then
	 * `refunds.create({ payment_intent })` with key `refund:<paymentId>`. Shared by a student's
	 * refund and the admin exception (V14). Returns the refund id, or null if already refunded.
	 */
	async refundAtStripe(payment: {
		paymentId: string;
		stripePaymentIntentId: string;
		disputeState: DisputeState | null;
	}): Promise<string | null> {
		const { paymentId, stripePaymentIntentId, disputeState } = payment;
		const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId, {
			expand: ["latest_charge"],
		});
		const charge =
			typeof pi.latest_charge === "object" ? pi.latest_charge : null;
		// D7 / C12: the stored state decides; Stripe's flag stays true after a won dispute, so
		// it only refuses while the stored state has not seen the dispute won.
		const disputed =
			disputeState === "open" ||
			(charge?.disputed === true && disputeState !== "won");
		if (disputed) throw new ChargeDisputedError();

		const existing = await stripe.refunds.list({
			payment_intent: stripePaymentIntentId,
			limit: 100,
		});
		const made = existing.data.filter(
			(r) => r.status === "succeeded" || r.status === "pending",
		);
		// qa #2: only refunds covering the whole charge count as done; after a partial
		// Dashboard refund, refunds.create({ payment_intent }) refunds the remainder.
		const refundedAmount = made.reduce((sum, r) => sum + r.amount, 0);
		const coversCharge = charge !== null && refundedAmount >= charge.amount;
		return coversCharge
			? (made[0]?.id ?? null)
			: this.createStripeRefund(paymentId, stripePaymentIntentId);
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
			// FR-P18: a charge disputed meanwhile is the dispute state, not a failure.
			if (
				error instanceof Stripe.errors.StripeError &&
				error.code === "charge_disputed"
			) {
				await paymentRepository.markDisputeOpen(paymentId);
				throw new ChargeDisputedError();
			}
			throw error;
		}
	}
}

export const refundService = new RefundService();
