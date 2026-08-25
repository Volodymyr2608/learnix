import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import { api } from "@/trpc/server";

const getNewReviewsCount = async (): Promise<number> => {
	return safeRequest(
		"instructor.getNewReviewsCount",
		async () => {
			return (await api.instructor.getNewReviewsCount()) ?? 0;
		},
		0,
	);
};

export default getNewReviewsCount;
