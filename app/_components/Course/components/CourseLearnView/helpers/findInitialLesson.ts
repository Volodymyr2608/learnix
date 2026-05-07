import { toFlatLessons } from "@/app/_components/Course/components/CourseLearnView/helpers/toFlatLessons";
import type { StudentCourseData } from "@/lib/requests/course/getStudentCourse";

export const findInitialLesson = (course: StudentCourseData) => {
	const flat = toFlatLessons(course);
	return flat.find((l) => !l.isCompleted)?.id ?? flat[0]?.id ?? "";
};
