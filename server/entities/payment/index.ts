import { z } from "zod";

export const createCheckoutSessionInput = z.object({
	courseId: z.string(),
});

export const connectStatusOutput = z.object({
	status: z.enum([
		"not_started",
		"action_required",
		"pending_review",
		"verified",
		"restricted",
	]),
	availableCents: z.number().int(),
	owedCents: z.number().int(),
});

export const instructorEarningsOutput = z.object({
	availableCents: z.number().int(),
	owedCents: z.number().int(),
	lifetimeGrossCents: z.number().int(),
	platformFeesCents: z.number().int(),
});

export const platformRevenueOutput = z.object({
	totalRevenueCents: z.number().int(),
});

export * from "./revenue";
