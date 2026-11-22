import type Stripe from "stripe";
import type { DisputeState } from "@/generated/prisma";
import { db } from "@/server/db";
import { instructorRepository } from "@/server/repositories/instructor.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { refundAuditRepository } from "@/server/repositories/refundAudit.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { refundEffectsService } from "@/server/services/refund/refundEffects.service";
import { refundNotificationsService } from "@/server/services/refund/refundNotifications.service";
import { adminAlertService } from "./adminAlert.service";
import { connectService } from "./connect.service";
import { paymentService } from "./payment.service";

const paymentIntentOf = (charge: Stripe.Charge): string | undefined =>
	typeof charge.payment_intent === "string"
		? charge.payment_intent
		: charge.payment_intent?.id;

/** D9: only `lost` returns the money to the customer; every other closing status keeps it. */
const disputeStateOf = (status: Stripe.Dispute.Status): DisputeState => {
	if (status === "lost") return "lost";
	if (
		status === "won" ||
		status === "warning_closed" ||
		status === "prevented"
	) {
		return "won";
	}
	return "open";
};

const refundPathOf = (
	ownRequest: boolean,
	exception: boolean,
): "refund_request" | "admin_exception" | "dashboard_refund" => {
	if (ownRequest) return "refund_request";
	if (exception) return "admin_exception";
	return "dashboard_refund";
};

class StripeEventService {
	/**
	 * ADR-037 §4 — the one handler for Stripe events, shared by the webhook and the daily replay
	 * (FR-P15). Correctness never rests on event dedup: the refund effects sit behind their own
	 * compare-and-set, so the same event handled twice, even concurrently, applies once (C8).
	 */
	async handle(event: Stripe.Event, now: Date): Promise<void> {
		switch (event.type) {
			case "checkout.session.completed": {
				const session = event.data.object as Stripe.Checkout.Session;
				await paymentService.finalizeCheckout(session.id);
				return;
			}
			case "charge.refunded": {
				await this.chargeRefunded(event.data.object as Stripe.Charge, now);
				return;
			}
			case "charge.dispute.created":
			case "charge.dispute.updated":
			case "charge.dispute.closed": {
				await this.disputeChanged(
					event.data.object as Stripe.Dispute,
					event.created,
					now,
				);
				return;
			}
			case "account.updated": {
				const account = event.data.object as Stripe.Account;
				await connectService.syncAccountStatus(account);
				if (!account.payouts_enabled) return;
				const profile = await instructorRepository.findFirst({
					where: { stripeAccountId: account.id },
				});
				if (!profile) return;
				// Same release function and predicate as the daily job (FR-P2). Imported lazily:
				// the job imports this service for its replay.
				const { payoutJobService } = await import("./payoutJob.service");
				await payoutJobService.releaseForInstructor(profile.userId, now);
				return;
			}
		}
	}

	/**
	 * FR-P18a / FR-P18b: the stored dispute state follows Stripe's events in event order (D2); a
	 * dispute closed lost is the student taking the money back — another refund path through the
	 * same effects function (DL).
	 */
	private async disputeChanged(
		dispute: Stripe.Dispute,
		eventCreated: number,
		now: Date,
	): Promise<void> {
		const paymentIntentId =
			typeof dispute.payment_intent === "string"
				? dispute.payment_intent
				: dispute.payment_intent?.id;
		if (!paymentIntentId) return;
		const state = disputeStateOf(dispute.status);
		const paymentId = await paymentRepository.recordDisputeState(
			paymentIntentId,
			state,
			eventCreated,
		);
		if (paymentId && state === "lost") {
			// Audit L2: if Learnix's own Stripe refund already went through, the refund — not the
			// bank — returned the money first; the share is then reversed like any refund.
			const refunded =
				await refundRequestRepository.hasStripeRefundForPayment(paymentId);
			await refundEffectsService.apply({
				paymentId,
				path: refunded ? "refund_request" : "lost_dispute",
				now,
			});
			// Matrix "Dispute closed lost" (V16): the admins always; the student unless Learnix's
			// own refund already told them. Both de-duplicated per payment.
			await adminAlertService.disputeLost(paymentId);
			if (!refunded) await refundNotificationsService.disputeLost(paymentId);
		}
	}

	/**
	 * A refund made outside Learnix (the Stripe Dashboard), or a Learnix refund whose effects
	 * already ran — then `apply` changes nothing (FR-P14). A partial refund applies no effects
	 * in this slice (R2, FR-P16).
	 */
	private async chargeRefunded(
		charge: Stripe.Charge,
		now: Date,
	): Promise<void> {
		const paymentIntentId = paymentIntentOf(charge);
		if (!paymentIntentId) return;
		const payment =
			await paymentRepository.findByPaymentIntentId(paymentIntentId);
		if (!payment) return;
		if (charge.amount_refunded < charge.amount) {
			// FR-A7 / FR-P16 (V15, W3): a partial Dashboard refund is recorded and reported; access,
			// records and the share are unchanged.
			await paymentRepository.recordPartialRefund(
				payment.id,
				charge.amount_refunded,
			);
			await adminAlertService.dashboardRefund(
				payment.id,
				charge.amount_refunded,
				now,
			);
			return;
		}
		// qa #4: the webhook for Learnix's own refund can beat executeRefund's apply; the
		// certificate is then revoked for the student's request, not "via the Dashboard" (R4).
		const ownRequest = await refundRequestRepository.hasProcessingForPayment(
			payment.id,
		);
		// V14: an admin exception's own webhook keeps its path (the audit row is written first).
		const exception = await refundAuditRepository.hasException(db, payment.id);
		const path = refundPathOf(ownRequest, exception);
		const applied = await refundEffectsService.apply({
			paymentId: payment.id,
			path,
			now,
		});
		// FR-A7 (V15): a full Dashboard refund is flagged and reported, once.
		if (applied && path === "dashboard_refund")
			await adminAlertService.dashboardRefund(
				payment.id,
				charge.amount_refunded,
				now,
			);
	}
}

export const stripeEventService = new StripeEventService();
