import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

export type CourseContentProps = {
	curriculum: NonNullable<GetPublishedCourseResponse>["curriculum"];
};
