import { notFound } from "next/navigation";
import getStudentCourse from "@/lib/requests/course/getStudentCourse";
import CourseLearnView from "./components/CourseLearnView";

export default async function ContinueLearningPage({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) {
	const { courseId } = await params;
	const course = await getStudentCourse(courseId);

	if (!course) {
		notFound();
	}

	return <CourseLearnView course={course} />;
}
