import type { StudentCourseData } from "@/lib/requests/course/getStudentCourse";

export const toFlatLessons = (course: StudentCourseData) => {
	return course.sections.flatMap((s) => s.lessons);
};
