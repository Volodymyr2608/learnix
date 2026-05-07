import { notFound } from "next/navigation";
import getStudentCourse from "@/lib/requests/course/getStudentCourse";
import getStudentLesson from "@/lib/requests/lesson/getStudentLesson";
import CourseLearnView from "../../../../../_components/Course/components/CourseLearnView";

export default async function LessonPage({
	params,
}: {
	params: Promise<{ courseId: string; lessonId: string }>;
}) {
	const { courseId, lessonId } = await params;

	const [course, lesson] = await Promise.all([
		getStudentCourse(courseId),
		getStudentLesson(lessonId),
	]);

	if (!course || !lesson) {
		notFound();
	}

	return <CourseLearnView course={course} lesson={lesson} />;
}
