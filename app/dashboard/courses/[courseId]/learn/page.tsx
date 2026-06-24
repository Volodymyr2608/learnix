import { notFound, redirect } from "next/navigation";
import { findInitialLesson } from "@/app/_components/Course/components/CourseLearnView/helpers/findInitialLesson";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import getStudentCourse from "@/lib/requests/course/getStudentCourse";

export default async function LearnPage({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) {
	const { courseId } = await params;
	const course = await getStudentCourse(courseId);

	if (!course) {
		notFound();
	}

	const lessonId = findInitialLesson(course);

	if (!lessonId) {
		notFound();
	}

	redirect(STUDENT_URLS.learnLesson(courseId, lessonId));
}
