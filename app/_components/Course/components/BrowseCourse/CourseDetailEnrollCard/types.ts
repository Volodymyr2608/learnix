import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

export type CourseDetailEnrollCardProps = {
	course: NonNullable<GetPublishedCourseResponse>;
};
