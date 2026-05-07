import type { StudentCourseData } from "@/lib/requests/course/getStudentCourse";
import type { StudentLessonData } from "@/lib/requests/lesson/getStudentLesson";

export type CourseLearnViewProps = {
	course: StudentCourseData;
	lesson: StudentLessonData;
};
