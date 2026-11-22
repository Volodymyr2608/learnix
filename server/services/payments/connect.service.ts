import type Stripe from "stripe";
import type { Payment } from "@/generated/prisma";
import { deriveConnectStatus } from "@/lib/connectStatus";
import { env } from "@/lib/env";
import type { ReleaseOutcome } from "@/server/entities/payout/payout.dto";
import { instructorRepository } from "@/server/repositories/instructor.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { stripe } from "./stripe.client";

class ConnectService {
	async createOnboardingLink(instructorId: string): Promise<{ url: string }> {
		const profile = await instructorRepository.findFirst({
			where: { userId: instructorId },
		});

		if (!profile) {
			throw new Error(`No instructor profile found for userId=${instructorId}`);
		}

		let accountId = profile.stripeAccountId;

		if (!accountId) {
			const account = await stripe.accounts.create({ type: "express" });
			accountId = account.id;
			await instructorRepository.update(profile.id, {
				stripeAccountId: accountId,
			});
		}

		const link = await stripe.accountLinks.create({
			account: accountId,
			type: "account_onboarding",
			refresh_url: `${env.BASE_URL}/settings?stripe=refresh`,
			return_url: `${env.BASE_URL}/settings?stripe=return`,
		});

		return { url: link.url };
	}

	async createLoginLink(instructorId: string): Promise<{ url: string }> {
		const profile = await instructorRepository.findFirst({
			where: { userId: instructorId },
		});

		if (!profile?.stripeAccountId) {
			throw new Error(
				`No Stripe account found for instructor userId=${instructorId}`,
			);
		}

		const link = await stripe.accounts.createLoginLink(profile.stripeAccountId);

		return { url: link.url };
	}

	async getConnectStatus(instructorId: string) {
		const profile = await instructorRepository.findFirst({
			where: { userId: instructorId },
		});

		if (!profile?.stripeAccountId) {
			return {
				status: "not_started" as const,
				availableCents: 0,
				owedCents: 0,
			};
		}

		const account = await stripe.accounts.retrieve(profile.stripeAccountId);
		const status = deriveConnectStatus(
			account as Parameters<typeof deriveConnectStatus>[0],
		);

		const [owedCents, transferredResult] = await Promise.all([
			paymentRepository.getOwedBalance(instructorId),
			paymentRepository.aggregate({
				where: { instructorId, transferStatus: "transferred" },
				_sum: { instructorNetCents: true },
			}),
		]);

		const availableCents =
			(transferredResult._sum as { instructorNetCents: number | null })
				.instructorNetCents ?? 0;

		return { status, availableCents, owedCents };
	}

	async syncAccountStatus(account: {
		id: string;
		charges_enabled: boolean;
		payouts_enabled: boolean;
	}): Promise<void> {
		const profile = await instructorRepository.findFirst({
			where: { stripeAccountId: account.id },
		});

		if (!profile) {
			throw new Error(
				`No instructor profile found for stripeAccountId=${account.id}`,
			);
		}

		const updateData: {
			stripeChargesEnabled: boolean;
			stripePayoutsEnabled: boolean;
			stripeOnboardedAt?: Date;
		} = {
			stripeChargesEnabled: account.charges_enabled,
			stripePayoutsEnabled: account.payouts_enabled,
		};

		if (account.payouts_enabled && !profile.stripeOnboardedAt) {
			updateData.stripeOnboardedAt = new Date();
		}

		await instructorRepository.update(profile.id, updateData);
	}

	/**
	 * FR-P4, FR-P24, ADR-037 §1–§2 — the ONLY function that creates a Stripe transfer (a contract
	 * test guards this). A `pending` payment is claimed with the full release predicate; a
	 * `transferring` one is a recovery after a crash and is not claimed again. Before creating, it
	 * lists transfers for the payment's group, because idempotency keys expire after 24 h (C7).
	 */
	async releasePayment(payment: Payment, now: Date): Promise<ReleaseOutcome> {
		const paymentId = payment.id;
		if (payment.transferStatus === "pending") {
			if (!(await payoutRepository.claimForRelease(paymentId, now))) {
				return { kind: "not_eligible", paymentId };
			}
		} else if (payment.transferStatus !== "transferring") {
			return { kind: "not_eligible", paymentId };
		}

		try {
			// Review #2: a transfer Stripe already made is recorded before any eligibility check, so a
			// later refund sees `transferred` (and can reverse) instead of a row back at `pending`.
			const grouped = await stripe.transfers.list({
				transfer_group: paymentId,
				limit: 1,
			});
			const groupedTransfer = grouped.data[0];
			if (groupedTransfer) {
				await payoutRepository.markTransferred(
					paymentId,
					groupedTransfer.id,
					now,
				);
				// Audit Low-1: money left after the student was refunded. Record the truth and surface
				// it as a failure; the reversal itself is slice 3 (C5 remainder).
				if (payment.refundedAt || payment.status === "refunded") {
					return {
						kind: "failed",
						paymentId,
						error: "Transferred after a refund — the transfer needs a reversal",
					};
				}
				return { kind: "already_transferred", paymentId };
			}

			const profile = await instructorRepository.findFirst({
				where: { userId: payment.instructorId },
			});
			// Live status, not the DB flag: account.updated may not have arrived yet.
			const account = profile?.stripeAccountId
				? await stripe.accounts.retrieve(profile.stripeAccountId)
				: null;
			if (!profile?.stripeAccountId || !account?.payouts_enabled) {
				await payoutRepository.releaseClaim(paymentId);
				return { kind: "waiting_for_stripe", paymentId };
			}

			// H4: a refund whose webhook was lost, or an open dispute, must not be paid out.
			const charge = await this.liveCharge(payment);
			if (!charge || charge.refunded || charge.disputed) {
				await payoutRepository.releaseClaim(paymentId);
				return { kind: "charge_not_payable", paymentId };
			}

			// Review #3: transfers made before slice 2 carry no transfer_group; find one by its source
			// charge so a legacy sale whose DB update was lost is not paid twice.
			const legacyTransfer = await this.findLegacyTransfer(
				profile.stripeAccountId,
				charge,
			);
			if (legacyTransfer) {
				await payoutRepository.markTransferred(
					paymentId,
					legacyTransfer.id,
					now,
				);
				return { kind: "already_transferred", paymentId };
			}

			const transfer = await stripe.transfers.create(
				{
					amount: payment.instructorNetCents ?? 0,
					currency: payment.currency,
					destination: profile.stripeAccountId,
					source_transaction: charge.id,
					transfer_group: paymentId,
				},
				{ idempotencyKey: `transfer:${paymentId}` },
			);
			await payoutRepository.markTransferred(paymentId, transfer.id, now);
			return { kind: "released", paymentId };
		} catch (error) {
			// H5: never guess whether Stripe created the transfer; stay `transferring` and let the
			// next run recover it list-before-retry. Audit Low-2: touch the row so it goes behind
			// fresh sales instead of heading every batch.
			try {
				await payoutRepository.touch(paymentId);
			} catch {
				// Ordering only; the run still reports the original error.
			}
			return {
				kind: "failed",
				paymentId,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Review #3 / audit Medium-1: a pre-slice-2 transfer has no transfer_group; find it by its source
	 * charge across every page of the destination's transfers since that charge.
	 */
	private async findLegacyTransfer(
		destination: string,
		charge: Stripe.Charge,
	): Promise<Stripe.Transfer | undefined> {
		let startingAfter: string | undefined;
		for (;;) {
			const page = await stripe.transfers.list({
				destination,
				created: { gte: charge.created },
				limit: 100,
				...(startingAfter ? { starting_after: startingAfter } : {}),
			});
			const match = page.data.find((t) => t.source_transaction === charge.id);
			if (match) return match;
			const last = page.data.at(-1);
			if (!page.has_more || !last) return undefined;
			startingAfter = last.id;
		}
	}

	private async liveCharge(payment: Payment): Promise<Stripe.Charge | null> {
		if (!payment.stripePaymentIntentId) return null;
		const pi = await stripe.paymentIntents.retrieve(
			payment.stripePaymentIntentId,
			{ expand: ["latest_charge"] },
		);
		return typeof pi.latest_charge === "object" ? pi.latest_charge : null;
	}

	/**
	 * C7 / ADR-037 §2: at most one reversal per transfer. Lists the transfer's reversals first
	 * (idempotency keys expire after 24 h), creates one with a key derived from the payment, and
	 * moves `transferred → reversed` by compare-and-set.
	 */
	async reverseTransfer(payment: Payment): Promise<void> {
		const transferId = payment.stripeTransferId;
		if (!transferId) {
			throw new Error(
				`Payment ${payment.id} has no stripeTransferId to reverse`,
			);
		}
		const existing = await stripe.transfers.listReversals(transferId, {
			limit: 1,
		});
		if (!existing.data[0]) {
			await stripe.transfers.createReversal(
				transferId,
				{ refund_application_fee: false },
				{ idempotencyKey: `reversal:${payment.id}` },
			);
		}
		await payoutRepository.markReversed(payment.id);
	}
}

export const connectService = new ConnectService();
