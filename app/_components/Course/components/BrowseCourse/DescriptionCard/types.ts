import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

export type DescriptionCardProps = {
	description: NonNullable<GetPublishedCourseResponse>["description"];
};
