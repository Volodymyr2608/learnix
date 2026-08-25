import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { ReviewCourseOption } from "@/server/entities/instructor/reviews";
import { api } from "@/trpc/server";

const getReviewCourseOptions = async (): Promise<ReviewCourseOption[]> => {
	return safeRequest("instructor.getReviewCourseOptions", async () => {
		return (await api.instructor.getReviewCourseOptions()) ?? [];
	}, []);
};

export default getReviewCourseOptions;
