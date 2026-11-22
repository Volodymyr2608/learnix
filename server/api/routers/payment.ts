import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createCheckoutSessionInput } from "@/server/entities/payment";
import {
	recentTransactionsInput,
	revenueRangeInput,
} from "@/server/entities/payment/revenue";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { connectService } from "@/server/services/payments/connect.service";
import { paymentService } from "@/server/services/payments/payment.service";
import { payoutJobService } from "@/server/services/payments/payoutJob.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import {
	adminProcedure,
	createTRPCRouter,
	instructorProcedure,
	studentProcedure,
} from "../trpc";

export const paymentRouter = createTRPCRouter({
	// Student procedures
	createCheckoutSession: studentProcedure
		.input(createCheckoutSessionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				return await paymentService.createCheckoutSession(
					ctx.session.user.id,
					input.courseId,
				);
			} catch (error) {
				throw handleServiceError(error);
			}
		}),

	getSessionStatus: studentProcedure
		.input(z.object({ sessionId: z.string() }))
		.query(async ({ ctx, input }) => {
			try {
				return await paymentService.finalizeCheckoutForStudent(
					input.sessionId,
					ctx.session.user.id,
				);
			} catch (error) {
				throw handleServiceError(error);
			}
		}),

	// Instructor procedures
	createConnectOnboardingLink: instructorProcedure.mutation(async ({ ctx }) => {
		try {
			return await connectService.createOnboardingLink(ctx.session.user.id);
		} catch (error) {
			throw handleServiceError(error);
		}
	}),

	createConnectLoginLink: instructorProcedure.mutation(async ({ ctx }) => {
		try {
			return await connectService.createLoginLink(ctx.session.user.id);
		} catch (error) {
			throw handleServiceError(error);
		}
	}),

	getConnectStatus: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await connectService.getConnectStatus(ctx.session.user.id);
		} catch (error) {
			throw handleServiceError(error);
		}
	}),

	getInstructorEarnings: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await paymentService.getInstructorEarnings(ctx.session.user.id);
		} catch (error) {
			throw handleServiceError(error);
		}
	}),

	getRevenueSummary: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await paymentService.getRevenueSummary(ctx.session.user.id);
		} catch (error) {
			throw handleServiceError(error);
		}
	}),

	getRevenueTimeSeries: instructorProcedure
		.input(revenueRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await paymentService.getRevenueTimeSeries(
					ctx.session.user.id,
					input.range,
				);
			} catch (error) {
				throw handleServiceError(error);
			}
		}),

	getRevenueByCourse: instructorProcedure
		.input(revenueRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await paymentService.getRevenueByCourse(
					ctx.session.user.id,
					input.range,
				);
			} catch (error) {
				throw handleServiceError(error);
			}
		}),

	getRecentTransactions: instructorProcedure
		.input(recentTransactionsInput)
		.query(async ({ ctx, input }) => {
			try {
				return await paymentService.getRecentTransactions(
					ctx.session.user.id,
					input.limit,
				);
			} catch (error) {
				throw handleServiceError(error);
			}
		}),

	// Admin procedures
	getPlatformRevenue: adminProcedure.query(async () => {
		try {
			const totalRevenueCents = await paymentRepository.getPlatformRevenue();
			return { totalRevenueCents };
		} catch (error) {
			throw handleServiceError(error);
		}
	}),

	/**
	 * "Run job now" (ADR-037 §3.7): the same job, lock and predicate as the daily cron. Replaces the
	 * old Sweep, which paid every pending sale, held and refunded ones included (C14).
	 */
	runPayoutJobNow: adminProcedure.mutation(async () => {
		const summary = await payoutJobService.run({
			trigger: "manual",
			now: new Date(),
		});
		if (summary.status === "already_running") {
			throw new TRPCError({
				code: "CONFLICT",
				message: "The payout job is already running",
			});
		}
		return summary;
	}),
});
