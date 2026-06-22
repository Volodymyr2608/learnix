import type { LucideIcon } from "lucide-react";
import type { GetPublishedCourseResponse } from "@/lib/requests/course/getCourseDetail";

type Course = NonNullable<GetPublishedCourseResponse>;

export type CourseDetailEnrollCardProps = {
	course: Course;
	/** Instructor "view as student" preview — disables purchase/enroll. */
	previewMode?: boolean;
};

export type EnrollActionProps = {
	course: Course;
	isEnrolled: boolean;
	onEnrollFree: () => void;
};

export type IncludeItemProps = {
	icon: LucideIcon;
	label: string;
};
