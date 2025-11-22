import {
	ArrowLeft,
	CheckCircle,
	Clock,
	Edit,
	Play,
	Star,
	Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import getCourseById from "@/lib/requests/course/getCourseById";
import { capitalize } from "@/lib/utils/capitalize";

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

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link href={INSTRUCTOR_URLS.courses}>
						<Button size="icon" variant="ghost">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h1 className="font-bold text-2xl">Course Preview</h1>
						<p className="text-muted-foreground text-sm">
							This is how students will see your course
						</p>
					</div>
				</div>
				<Button asChild>
					<Link href={INSTRUCTOR_URLS.editCourse(courseId) as string}>
						<Edit className="mr-2 h-4 w-4" />
						Edit Course
					</Link>
				</Button>
			</div>

			{/* Preview Notice */}
			<div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100">
				<strong>Preview Mode:</strong> This is how your course appears to
				potential students. Make sure everything looks perfect before
				publishing.
			</div>

			{/* Course Preview Content - Similar to public course page */}
			<div className="grid gap-6 lg:grid-cols-3">
				<div className="space-y-6 lg:col-span-2">
					{/* Hero */}
					<div className="space-y-4">
						<Badge>{capitalize(course.category)}</Badge>
						<h1 className="font-bold text-4xl">{course.title}</h1>
						<p className="text-lg text-muted-foreground">
							{course.description}
						</p>

						<div className="flex flex-wrap items-center gap-4 text-sm">
							<div className="flex items-center gap-1">
								<Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
								<span className="font-semibold">0</span>
								<span className="text-muted-foreground">(0 ratings)</span>
							</div>
							<div className="flex items-center gap-1">
								<Users className="h-4 w-4" />
								<span>0 students</span>
							</div>
							<div className="flex items-center gap-1">
								<Clock className="h-4 w-4" />
								<span>{course.duration} hours</span>
							</div>
						</div>
					</div>

					{/* Video Preview */}
					<Card className="aspect-video overflow-hidden">
						{course.previewVideoUrl && (
							<div className="flex h-full items-center justify-center bg-muted">
								<div className="text-center">
									<Play className="mx-auto h-16 w-16 text-muted-foreground" />
									<p className="mt-2 text-muted-foreground text-sm">
										Course Preview Video
									</p>
								</div>
							</div>
						)}

						{course.thumbnailUrl && !course.previewVideoUrl && (
							<div className="relative aspect-video w-full overflow-hidden bg-muted">
								<Image
									alt={course.title}
									className="h-full w-full object-cover"
									fill
									src={course.thumbnailUrl || "/placeholder.svg"}
								/>
							</div>
						)}
					</Card>

					{/* What You'll Learn */}
					<Card className="p-6">
						<h2 className="mb-4 font-bold text-2xl">What you'll learn</h2>
						<div className="grid gap-3 md:grid-cols-2">
							{course.objectives.map((item) => (
								<div className="flex gap-2" key={item}>
									<CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
									<span className="text-sm">{item}</span>
								</div>
							))}
						</div>
					</Card>

					{/* Course Content */}
					<Card className="p-6">
						<h2 className="mb-4 font-bold text-2xl">Course content</h2>
						<div className="mb-4 text-muted-foreground text-sm">
							{course.sections.length} sections • 64 lectures • 52h total length
						</div>
						<div className="space-y-2">
							{course.sections.map((section) => (
								<div className="rounded-lg border p-4" key={section.title}>
									<div className="flex items-center justify-between">
										<h3 className="font-semibold">{section.title}</h3>
										<span className="text-muted-foreground text-sm">
											{section.lessons.length} lectures • 10 min
										</span>
									</div>
								</div>
							))}
						</div>
					</Card>
				</div>

				{/* Sidebar */}
				<div className="space-y-6">
					<Card className="sticky top-6 p-6">
						<div className="space-y-4">
							<div>
								<div className="flex items-baseline gap-2">
									<span className="font-bold text-3xl">${course.price}</span>
									<span className="text-lg text-muted-foreground line-through">
										${course.originalPrice}
									</span>
								</div>
								<p className="text-green-600 text-sm">55% off</p>
							</div>

							<Button className="w-full" disabled size="lg">
								Preview Mode - Not Purchasable
							</Button>

							<div className="space-y-2 text-sm">
								<h3 className="font-semibold">This course includes:</h3>
								<div className="space-y-1 text-muted-foreground">
									<p>• 52 hours on-demand video</p>
									<p>• 15 downloadable resources</p>
									<p>• Full lifetime access</p>
									<p>• Certificate of completion</p>
								</div>
							</div>
						</div>
					</Card>
				</div>
			</div>
		</div>
	);
}
