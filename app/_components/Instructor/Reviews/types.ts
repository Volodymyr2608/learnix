import type { ReactNode } from "react";
import type {
	PaginatedReviews,
	ReviewCourseOption,
	ReviewRow,
	ReviewStats,
	ReviewsQueryState,
} from "@/server/entities/instructor/reviews";

export type { ReviewsQueryState };

export type ReviewsStatsProps = { stats: ReviewStats };

export type StatCardProps = {
	label: string;
	value: string;
	tint: string;
	icon: ReactNode;
};

export type ReviewsFiltersProps = {
	courses: ReviewCourseOption[];
	query: ReviewsQueryState;
};

export type ReviewsResultsProps = {
	reviews: PaginatedReviews;
	query: ReviewsQueryState;
};

export type ReviewCardProps = { review: ReviewRow };

export type StarsProps = { rating: number; className?: string };
