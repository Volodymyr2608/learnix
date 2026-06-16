import type { TopCourse } from "@/server/entities/instructor/dashboard";

export type TopPerformingCoursesProps = {
	courses: TopCourse[];
};

export type TopCourseRowProps = {
	course: TopCourse;
};
