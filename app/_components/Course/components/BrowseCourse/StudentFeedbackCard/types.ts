import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

export type StudentFeedbackCardProps = Pick<
	NonNullable<GetPublishedCourseResponse>,
	"rating" | "reviews" | "ratingDistribution"
>;
