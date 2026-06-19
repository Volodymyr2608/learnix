import type {
	GetReviewStatsInput,
	GetReviewsInput,
	ReviewsQueryState,
} from "@/server/entities/instructor/reviews";

type RawSearchParams = Record<string, string | string[] | undefined>;
const RATINGS = ["1", "2", "3", "4", "5"] as const;

function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function asRating(value: string | undefined): string {
	return RATINGS.includes(value as (typeof RATINGS)[number])
		? (value as string)
		: "all";
}

function asPage(value: string | undefined): number {
	const page = Number.parseInt(value ?? "", 10);
	return Number.isFinite(page) && page >= 1 ? page : 1;
}

/** Parse raw URL search params into the page's controlled query state. */
export function parseReviewsSearchParams(
	sp: RawSearchParams,
): ReviewsQueryState {
	return {
		courseId: first(sp.courseId) ?? "all",
		rating: asRating(first(sp.rating)),
		page: asPage(first(sp.page)),
	};
}

/** Shape the controlled query state into the `getReviewStats` tRPC input. */
export function toStatsInput(query: ReviewsQueryState): GetReviewStatsInput {
	return { courseId: query.courseId === "all" ? undefined : query.courseId };
}

/** Shape the controlled query state into the `getReviews` tRPC input. */
export function toReviewsInput(query: ReviewsQueryState): GetReviewsInput {
	return {
		courseId: query.courseId === "all" ? undefined : query.courseId,
		rating: query.rating === "all" ? undefined : Number(query.rating),
		page: query.page,
	};
}
