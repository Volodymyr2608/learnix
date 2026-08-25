import { safeRequest } from "@/lib/requests/_shared/safeRequest";
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
	return safeRequest(
		"instructor.getReviews",
		async () => {
			return (await api.instructor.getReviews(input)) ?? empty(input.page);
		},
		empty(input.page),
	);
};

export default getReviews;
