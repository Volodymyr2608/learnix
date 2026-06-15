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

		if (!profile?.stripePayoutsEnabled || !profile.stripeAccountId) {
			await paymentRepository.update(payment.id, {
				transferStatus: "pending",
			});
			return;
		}

		const transfer = await stripe.transfers.create({
			amount: payment.instructorNetCents ?? 0,
			currency: payment.currency,
			destination: profile.stripeAccountId,
			source_transaction: payment.stripePaymentIntentId ?? undefined,
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

		for (const payment of payments) {
			await this.transferToInstructor(payment);
		}
	}

	async reverseTransfer(payment: Payment): Promise<void> {
		if (!payment.stripeTransferId) {
			throw new Error(
				`Payment ${payment.id} has no stripeTransferId to reverse`,
			);
		}

		await stripe.transferReversals.create(payment.stripeTransferId, {
			refund_application_fee: false,
		});

		await paymentRepository.update(payment.id, {
			transferStatus: "reversed",
		});
	}
}

export const connectService = new ConnectService();
