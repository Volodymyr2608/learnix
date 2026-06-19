import { z } from "zod";
import type { ReviewTag } from "@/generated/prisma";

export const REVIEWS_PER_PAGE = 10;

export const getReviewStatsInput = z.object({
	courseId: z.string().cuid().optional(),
});
export type GetReviewStatsInput = z.infer<typeof getReviewStatsInput>;

export const getReviewsInput = z.object({
	courseId: z.string().cuid().optional(),
	rating: z.number().int().min(1).max(5).optional(),
	page: z.number().int().min(1).default(1),
});
export type GetReviewsInput = z.infer<typeof getReviewsInput>;

export type ReviewCourseOption = { id: string; title: string };

export type RatingDistributionBucket = {
	star: number; // 5..1
	count: number;
	percent: number; // 0..100
};

export type ReviewStats = {
	average: number | null; // null when total === 0
	total: number;
	fiveStarPercent: number; // 0..100
	lowRatingCount: number; // rating <= 2
	distribution: RatingDistributionBucket[]; // 5 buckets, star 5..1
};

export type ReviewRow = {
	id: string;
	studentName: string;
	studentImage: string | null;
	courseTitle: string;
	rating: number;
	comment: string;
	tags: ReviewTag[];
	createdAt: Date;
};

export type PaginatedReviews = {
	data: ReviewRow[];
	total: number;
	currentPage: number;
	perPage: number;
	lastPage: number;
};

export type ReviewsQueryState = {
	courseId: string; // "all" | cuid
	rating: string; // "all" | "1".."5"
	page: number;
};
