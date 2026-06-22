import type { ReactNode } from "react";
import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

export type CourseDetailViewCourse = NonNullable<GetPublishedCourseResponse>;

export type CourseDetailViewProps = {
	course: CourseDetailViewCourse;
	/**
	 * When true the enroll/purchase actions are replaced with a disabled
	 * "preview only" CTA — used by the instructor preview page where buying
	 * your own course is not allowed.
	 */
	previewMode?: boolean;
	/**
	 * Optional content rendered above the enroll card in the right column
	 * (e.g. the instructor publish-readiness panel). When present the right
	 * column is not made sticky.
	 */
	sidebarSlot?: ReactNode;
};
