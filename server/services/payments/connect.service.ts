import type { Payment } from "@/generated/prisma";
import { deriveConnectStatus } from "@/lib/connectStatus";
import { env } from "@/lib/env";
import { instructorRepository } from "@/server/repositories/instructor.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
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

	async transferToInstructor(payment: Payment): Promise<void> {
		const profile = await instructorRepository.findFirst({
			where: { userId: payment.instructorId },
		});

		if (!profile?.stripeAccountId) {
			await paymentRepository.update(payment.id, {
				transferStatus: "pending",
			});
			return;
		}

		// Check live Stripe status — do not trust the DB field which depends on
		// account.updated Connect webhooks that may not have been delivered yet.
		const account = await stripe.accounts.retrieve(profile.stripeAccountId);
		if (!account.payouts_enabled) {
			await paymentRepository.update(payment.id, {
				transferStatus: "pending",
			});
			return;
		}

		// Resolve the Charge ID from the PaymentIntent so source_transaction is valid.
		// Stripe transfers require a ch_xxx charge ID, not a pi_xxx payment intent ID.
		let sourceTransaction: string | undefined;
		if (payment.stripePaymentIntentId) {
			const pi = await stripe.paymentIntents.retrieve(
				payment.stripePaymentIntentId,
			);
			sourceTransaction =
				typeof pi.latest_charge === "string"
					? pi.latest_charge
					: (pi.latest_charge?.id ?? undefined);
		}

		const transfer = await stripe.transfers.create({
			amount: payment.instructorNetCents ?? 0,
			currency: payment.currency,
			destination: profile.stripeAccountId,
			source_transaction: sourceTransaction,
		});

		await paymentRepository.update(payment.id, {
			transferStatus: "transferred",
			stripeTransferId: transfer.id,
			transferredAt: new Date(),
		});
	}

	async sweepPendingTransfers(instructorId: string): Promise<void> {
		const payments = await paymentRepository.findMany({
			where: { instructorId, transferStatus: "pending" },
		});

		// Attempt every payment independently so one failure does not block the
		// rest. Collect failures and rethrow at the end — already-transferred
		// payments are skipped on retry, so re-running the sweep is idempotent.
		const failures: { paymentId: string; error: unknown }[] = [];

		for (const payment of payments) {
			try {
				await this.transferToInstructor(payment);
			} catch (error) {
				failures.push({ paymentId: payment.id, error });
			}
		}

		if (failures.length > 0) {
			throw new AggregateError(
				failures.map((f) => f.error),
				`Failed to transfer ${failures.length}/${payments.length} pending payment(s) for instructor ${instructorId}: ${failures
					.map((f) => f.paymentId)
					.join(", ")}`,
			);
		}
	}

	async reverseTransfer(payment: Payment): Promise<void> {
		if (!payment.stripeTransferId) {
			throw new Error(
				`Payment ${payment.id} has no stripeTransferId to reverse`,
			);
		}

		await stripe.transfers.createReversal(payment.stripeTransferId, {
			refund_application_fee: false,
		});

		await paymentRepository.update(payment.id, {
			transferStatus: "reversed",
		});
	}
}

export const connectService = new ConnectService();
