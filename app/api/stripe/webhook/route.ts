import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { instructorRepository } from "@/server/repositories/instructor.repository";
import { processedStripeEventRepository } from "@/server/repositories/payment.repository";
import { connectService } from "@/server/services/payments/connect.service";
import { paymentService } from "@/server/services/payments/payment.service";
import { stripe } from "@/server/services/payments/stripe.client";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
	const body = await req.text();
	const sig = req.headers.get("stripe-signature");

	// Connect events carry a Stripe-Account header; platform events do not.
	const isConnectEvent = !!req.headers.get("stripe-account");
	const secret = isConnectEvent
		? env.STRIPE_CONNECT_WEBHOOK_SECRET
		: env.STRIPE_WEBHOOK_SECRET;

	let event: Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(body, sig ?? "", secret);
	} catch {
		return new Response("invalid signature", { status: 400 });
	}

	if (await processedStripeEventRepository.exists(event.id)) {
		return Response.json({ ok: true });
	}

	try {
		switch (event.type) {
			case "checkout.session.completed": {
				const session = event.data.object as Stripe.Checkout.Session;
				await paymentService.finalizeCheckout(session.id);
				break;
			}
			case "charge.refunded": {
				const charge = event.data.object as Stripe.Charge;
				const paymentIntentId =
					typeof charge.payment_intent === "string"
						? charge.payment_intent
						: charge.payment_intent?.id;
				if (paymentIntentId) {
					await paymentService.handleRefund(paymentIntentId);
				}
				break;
			}
			case "account.updated": {
				const account = event.data.object as Stripe.Account;
				await connectService.syncAccountStatus(account);
				if (account.payouts_enabled) {
					const profile = await instructorRepository.findFirst({
						where: { stripeAccountId: account.id },
					});
					if (profile) {
						await connectService.sweepPendingTransfers(profile.userId);
					}
				}
				break;
			}
		}
	} catch (err) {
		console.error("Webhook handler error:", err);
		return new Response("webhook handler failed", { status: 500 });
	}

	await processedStripeEventRepository.record(event.id, event.type);
	return Response.json({ ok: true });
}
