import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { processedStripeEventRepository } from "@/server/repositories/payment.repository";
import { stripe } from "@/server/services/payments/stripe.client";
import { stripeEventService } from "@/server/services/payments/stripeEvent.service";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";

// Platform and Connect webhook endpoints both deliver to this URL, each signed
// with its own secret. Stripe sends NO header to distinguish them (the only
// Connect signal — `account` — lives inside the signed body, which we can't
// trust until verification succeeds), so we try each secret and use whichever
// the signature validates against.
function verifyEvent(body: string, sig: string): Stripe.Event {
	const secrets = [
		env.STRIPE_WEBHOOK_SECRET,
		env.STRIPE_CONNECT_WEBHOOK_SECRET,
	];
	for (const secret of secrets) {
		try {
			return stripe.webhooks.constructEvent(body, sig, secret);
		} catch {
			// Wrong secret for this event — try the next one.
		}
	}
	throw new Error("signature does not match any configured webhook secret");
}

export async function POST(req: NextRequest) {
	const body = await req.text();
	const sig = req.headers.get("stripe-signature");

	let event: Stripe.Event;
	try {
		event = verifyEvent(body, sig ?? "");
	} catch {
		return new Response("invalid signature", { status: 400 });
	}

	if (await processedStripeEventRepository.exists(event.id)) {
		return Response.json({ ok: true });
	}

	try {
		await stripeEventService.handle(event, new Date());
	} catch (err) {
		logger.error("Webhook handler error:", err);
		return new Response("webhook handler failed", { status: 500 });
	}

	await processedStripeEventRepository.record(event.id, event.type);
	return Response.json({ ok: true });
}
