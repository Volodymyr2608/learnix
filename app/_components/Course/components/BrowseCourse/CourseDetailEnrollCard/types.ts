import type { LucideIcon } from "lucide-react";
import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

type Course = NonNullable<GetPublishedCourseResponse>;

export type CourseDetailEnrollCardProps = {
	course: Course;
	/** Instructor preview — disables purchase/enroll. */
	previewMode?: boolean;
	/** Whether the current student already owns/enrolled in this course. */
	isEnrolled?: boolean;
	/** Resume deep-link target for an enrolled student, if any. */
	nextLessonId?: string | null;
};

export type EnrollActionProps = {
	course: Course;
	isEnrolled: boolean;
	nextLessonId: string | null;
	onEnrollFree: () => void;
};

export type IncludeItemProps = {
	icon: LucideIcon;
	label: string;
};
