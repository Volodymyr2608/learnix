import type Stripe from "stripe";
import { instructorRepository } from "@/server/repositories/instructor.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { refundEffectsService } from "@/server/services/refund/refundEffects.service";
import { connectService } from "./connect.service";
import { paymentService } from "./payment.service";

const paymentIntentOf = (charge: Stripe.Charge): string | undefined =>
	typeof charge.payment_intent === "string"
		? charge.payment_intent
		: charge.payment_intent?.id;

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
	 * A refund made outside Learnix (the Stripe Dashboard), or a Learnix refund whose effects
	 * already ran — then `apply` changes nothing (FR-P14). A partial refund applies no effects
	 * in this slice (R2, FR-P16).
	 */
	private async chargeRefunded(
		charge: Stripe.Charge,
		now: Date,
	): Promise<void> {
		if (charge.amount_refunded < charge.amount) return;
		const paymentIntentId = paymentIntentOf(charge);
		if (!paymentIntentId) return;
		const payment =
			await paymentRepository.findByPaymentIntentId(paymentIntentId);
		if (!payment) return;
		await refundEffectsService.apply({
			paymentId: payment.id,
			path: "dashboard_refund",
			now,
		});
	}
}

export const stripeEventService = new StripeEventService();
