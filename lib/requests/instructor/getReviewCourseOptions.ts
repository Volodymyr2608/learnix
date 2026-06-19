import type { ReviewCourseOption } from "@/server/entities/instructor/reviews";
import { api } from "@/trpc/server";

const getReviewCourseOptions = async (): Promise<ReviewCourseOption[]> => {
	try {
		return (await api.instructor.getReviewCourseOptions()) ?? [];
	} catch (error) {
		console.error("Error fetching review course options:", error);
		return [];
	}
};

export default getReviewCourseOptions;
