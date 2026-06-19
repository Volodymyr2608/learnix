import { api } from "@/trpc/server";

const getNewReviewsCount = async (): Promise<number> => {
	try {
		return (await api.instructor.getNewReviewsCount()) ?? 0;
	} catch (error) {
		console.error("Error fetching new reviews count:", error);
		return 0;
	}
};

export default getNewReviewsCount;
