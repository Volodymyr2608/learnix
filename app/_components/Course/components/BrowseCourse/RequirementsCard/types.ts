import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

export type RequirementsCardProps = {
	requirements: NonNullable<GetPublishedCourseResponse>["requirements"];
};
