import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

type Course = NonNullable<GetPublishedCourseResponse>;

export type CourseDetailEnrollCardProps = {
	course: Course;
};

export type EnrollActionProps = {
	course: Course;
	isEnrolled: boolean;
	onEnrollFree: () => void;
};
