import type { PublishedCourse } from "@/lib/requests/course/getPublishedCourses";

export type BrowseCourseCardProps = {
	course: PublishedCourse;
	isEnrolled: boolean;
	nextLessonId: string | null;
};

export type SelectedCourse = Pick<
	PublishedCourse,
	"id" | "title" | "instructor" | "thumbnail" | "duration" | "level"
>;
