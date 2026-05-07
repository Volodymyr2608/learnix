import type { PublishedCourse } from "@/lib/requests/course/getPublishedCourses";

export type BrowseCoursesProps = {
	courses: PublishedCourse[];
	enrolledMap: Record<string, string | null>;
	q: string;
	category: string;
};
