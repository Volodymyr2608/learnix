import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

export type ObjectiveCardProps = {
	objectives: NonNullable<GetPublishedCourseResponse>["objectives"];
};
