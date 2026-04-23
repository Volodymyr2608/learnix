import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

export type InstructorCardProps = {
	instructor: NonNullable<GetPublishedCourseResponse>["instructor"];
};
