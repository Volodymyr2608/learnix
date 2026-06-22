import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/app/_components/_shared/ui/button";
import CourseDetailView from "@/app/_components/Course/components/BrowseCourse/CourseDetailView";
import { getPublishedCourse } from "@/lib/requests/course/getCourseDetail";
import getEnrollmentStatus from "@/lib/requests/course/getEnrollmentStatus";

const DashboardCourseDetailPage = async ({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) => {
	const { courseId } = await params;
	const [course, { isEnrolled, nextLessonId }] = await Promise.all([
		getPublishedCourse(courseId),
		getEnrollmentStatus(courseId),
	]);

	if (!course) {
		notFound();
	}

	return (
		<div className="space-y-6">
			<Button asChild size="sm" variant="ghost">
				<Link href="/dashboard/browse">
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back to Browse
				</Link>
			</Button>

			<CourseDetailView
				course={course}
				isEnrolled={isEnrolled}
				nextLessonId={nextLessonId}
			/>
		</div>
	);
};

export default DashboardCourseDetailPage;
