import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

export type CourseDetailViewCourse = NonNullable<GetPublishedCourseResponse>;

export type CourseDetailViewProps = {
	course: CourseDetailViewCourse;
	/**
	 * When true the enroll/purchase actions are replaced with a disabled
	 * "preview only" CTA — used by the instructor "view as student" page where
	 * buying your own course is not allowed.
	 */
	previewMode?: boolean;
};
