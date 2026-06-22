import { notFound } from "next/navigation";
import { getPublishReadiness } from "@/lib/course/publishReadiness";
import getCourseById from "@/lib/requests/course/getCourseById";
import { CourseContentCard } from "./_components/CourseContentCard";
import { PreviewHeader } from "./_components/PreviewHeader";
import { PreviewHero } from "./_components/PreviewHero";
import { PreviewMedia } from "./_components/PreviewMedia";
import { PricingSidebar } from "./_components/PricingSidebar";
import { PublishReadinessPanel } from "./_components/PublishReadinessPanel";
import { ViewAsStudentLink } from "./_components/ViewAsStudentLink";

export default async function InstructorCoursePreviewPage({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) {
	const { courseId } = await params;
	const course = await getCourseById(courseId);

	if (!course) {
		notFound();
	}

	const readiness = getPublishReadiness({
		thumbnailUrl: course.thumbnailUrl,
		objectives: course.objectives,
		description: course.description,
		priceCents: course.priceCents,
		sections: course.sections,
	});

	return (
		<div className="space-y-6">
			<PreviewHeader courseId={courseId} />

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="space-y-6 lg:col-span-2">
					<PreviewHero
						averageRating={course.averageRating}
						category={course.category}
						description={course.description}
						duration={course.duration}
						objectives={course.objectives}
						reviewsCount={course.reviewsCount}
						studentCount={course._count.enrollments}
						title={course.title}
					/>
					<PreviewMedia
						previewVideoUrl={course.previewVideoUrl}
						thumbnailUrl={course.thumbnailUrl}
						title={course.title}
					/>
					<CourseContentCard courseId={courseId} sections={course.sections} />
				</div>

				<div className="space-y-6">
					<PricingSidebar
						originalPriceCents={course.originalPriceCents}
						priceCents={course.priceCents}
						sections={course.sections}
					/>
					<ViewAsStudentLink
						courseId={courseId}
						isPublished={course.status === "published"}
					/>
					<PublishReadinessPanel readiness={readiness} />
				</div>
			</div>
		</div>
	);
}
