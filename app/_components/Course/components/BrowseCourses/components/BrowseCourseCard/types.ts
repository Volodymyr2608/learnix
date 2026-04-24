import type { PublishedCourse } from "@/lib/requests/course/getPublishedCourses";

export type BrowseCourseCardProps = {
	course: PublishedCourse;
};

export type SelectedCourse = Pick<
	PublishedCourse,
	"id" | "title" | "instructor" | "thumbnail" | "duration" | "level"
>;
