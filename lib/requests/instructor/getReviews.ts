import type {
	GetReviewsInput,
	PaginatedReviews,
} from "@/server/entities/instructor/reviews";
import { api } from "@/trpc/server";

const empty = (page: number): PaginatedReviews => ({
	data: [],
	total: 0,
	currentPage: page,
	perPage: 0,
	lastPage: 1,
});

const getReviews = async (
	input: GetReviewsInput,
): Promise<PaginatedReviews> => {
	try {
		return (await api.instructor.getReviews(input)) ?? empty(input.page);
	} catch (error) {
		console.error("Error fetching instructor reviews:", error);
		return empty(input.page);
	}
};

export default getReviews;
