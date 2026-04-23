import type { PublishedCourse } from "@/app/_components/Course/components/BrowseCourses/actions/getPublishedCourses";

export type BrowseCourseCardProps = {
	course: PublishedCourse;
};

export type SelectedCourse = Pick<
	PublishedCourse,
	"id" | "title" | "instructor" | "thumbnail" | "duration" | "level"
>;
