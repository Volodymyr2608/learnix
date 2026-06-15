import { z } from "zod";
import { createCheckoutSessionInput } from "@/server/entities/payment";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { connectService } from "@/server/services/payments/connect.service";
import { paymentService } from "@/server/services/payments/payment.service";
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
		.query(async ({ input }) => {
			try {
				return await paymentService.finalizeCheckout(input.sessionId);
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

	// Admin procedures
	getPlatformRevenue: adminProcedure.query(async () => {
		try {
			const totalRevenueCents = await paymentRepository.getPlatformRevenue();
			return { totalRevenueCents };
		} catch (error) {
			throw handleServiceError(error);
		}
	}),
});