import type { TABS } from "@/app/_components/Course/components/MyCourses/constants";
import type { EnrolledCourse } from "@/lib/requests/course/getStudentEnrolledCourses";

export type Tab = (typeof TABS)[number]["value"];

export type MyCoursesProps = {
	courses: EnrolledCourse[];
	total: number;
	currentTab: Tab;
	currentPage: number;
};
