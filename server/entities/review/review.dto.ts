import { z } from "zod";
import { ReviewTag } from "@/generated/prisma";

export const reviewTagSchema = z.nativeEnum(ReviewTag);

export const createReviewInput = z.object({
	courseId: z.string().min(1),
	rating: z.number().int().min(1).max(5),
	comment: z.string().min(50),
	tags: z.array(reviewTagSchema).default([]),
});

export type CreateReviewInput = z.infer<typeof createReviewInput>;

export type CourseSummary = {
	id: string;
	title: string;
	instructor: string;
	completedDate: string;
	totalLessons: number;
	duration: string;
};

export type ReviewView = {
	rating: number;
	comment: string;
	tags: ReviewTag[];
	createdAt: string;
};

export type EligibilityResult =
	| { state: "ineligible" }
	| { state: "alreadyReviewed"; review: ReviewView; course: CourseSummary }
	| { state: "eligible"; course: CourseSummary };
