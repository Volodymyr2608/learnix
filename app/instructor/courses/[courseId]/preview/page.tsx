import { notFound } from "next/navigation";
import CourseDetailView from "@/app/_components/Course/components/BrowseCourse/CourseDetailView";
import { getPublishReadiness } from "@/lib/course/publishReadiness";
import { getOwnCourseDetail } from "@/lib/requests/course/getOwnCourseDetail";
import { PreviewHeader } from "./_components/PreviewHeader";
import { PublishReadinessPanel } from "./_components/PublishReadinessPanel";

export default async function InstructorCoursePreviewPage({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) {
	const { courseId } = await params;
	const course = await getOwnCourseDetail(courseId);

	if (!course) {
		notFound();
	}

	const readiness = getPublishReadiness({
		thumbnailUrl: course.thumbnail,
		objectives: course.objectives,
		description: course.description,
		priceCents: course.priceCents,
		sections: course.curriculum.map((section) => ({
			lessons: section.lessons,
		})),
	});
	const isPublished = course.status === "published";

	return (
		<div className="space-y-6">
			<PreviewHeader courseId={courseId} />
			<PublishReadinessPanel isPublished={isPublished} readiness={readiness} />
			<CourseDetailView course={course} previewMode />
		</div>
	);
}
