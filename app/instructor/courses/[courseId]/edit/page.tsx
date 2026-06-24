import { notFound } from "next/navigation";
import CourseBuilder from "@/app/_components/Course/components/CourseBuilder";
import courseAdapter from "@/lib/adapters/course/courseAdapter";
import getCourseById from "@/lib/requests/course/getCourseById";
import getOwnCourseStats from "@/lib/requests/course/getOwnCourseStats";

export default async function InstructorEditCoursePage({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) {
	const { courseId } = await params;

	const [course, stats] = await Promise.all([
		getCourseById(courseId),
		getOwnCourseStats(courseId),
	]);

	if (!course) {
		notFound();
	}

	return (
		<CourseBuilder course={courseAdapter(course)} mode="edit" stats={stats} />
	);
}
