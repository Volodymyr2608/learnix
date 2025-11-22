import { notFound } from "next/navigation";
import WithAuthProtection from "@/app/_components/_shared/WithAuthProtection";
import CourseBuilder from "@/app/_components/Course/components/CourseBuilder";
import courseAdapter from "@/lib/adapters/course/courseAdapter";
import getCourseById from "@/lib/requests/course/getCourseById";

export default async function InstructorEditCoursePage({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) {
	const { courseId } = await params;

	const course = await getCourseById(courseId);

	if (!course) {
		notFound();
	}

	return (
		<WithAuthProtection>
			<CourseBuilder course={courseAdapter(course)} mode="edit" />
		</WithAuthProtection>
	);
}
