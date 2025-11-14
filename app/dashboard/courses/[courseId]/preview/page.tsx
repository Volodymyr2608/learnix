import {
	ArrowLeft,
	CheckCircle,
	Clock,
	Edit,
	Play,
	Star,
	Users,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import DASHBOARD_URLS from "@/lib/constants/urls/dashboardUrls";

export default async function InstructorCoursePreviewPage({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) {
	const { courseId } = await params;

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link href={DASHBOARD_URLS.courses}>
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
					<Link href={DASHBOARD_URLS.editCourse(courseId) as string}>
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
						<Badge>Development</Badge>
						<h1 className="font-bold text-4xl">
							Complete Web Development Bootcamp
						</h1>
						<p className="text-lg text-muted-foreground">
							Learn HTML, CSS, JavaScript, React, Node.js and more in this
							comprehensive bootcamp
						</p>

						<div className="flex flex-wrap items-center gap-4 text-sm">
							<div className="flex items-center gap-1">
								<Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
								<span className="font-semibold">4.9</span>
								<span className="text-muted-foreground">(245 ratings)</span>
							</div>
							<div className="flex items-center gap-1">
								<Users className="h-4 w-4" />
								<span>456 students</span>
							</div>
							<div className="flex items-center gap-1">
								<Clock className="h-4 w-4" />
								<span>52 hours</span>
							</div>
						</div>
					</div>

					{/* Video Preview */}
					<Card className="aspect-video overflow-hidden">
						<div className="flex h-full items-center justify-center bg-muted">
							<div className="text-center">
								<Play className="mx-auto h-16 w-16 text-muted-foreground" />
								<p className="mt-2 text-muted-foreground text-sm">
									Course Preview Video
								</p>
							</div>
						</div>
					</Card>

					{/* What You'll Learn */}
					<Card className="p-6">
						<h2 className="mb-4 font-bold text-2xl">What you'll learn</h2>
						<div className="grid gap-3 md:grid-cols-2">
							{[
								"Build responsive websites with HTML, CSS, and JavaScript",
								"Master React and modern frontend development",
								"Create backend APIs with Node.js and Express",
								"Work with databases like MongoDB and PostgreSQL",
								"Deploy applications to production",
								"Understand web security best practices",
							].map((item) => (
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
							8 sections • 64 lectures • 52h total length
						</div>
						<div className="space-y-2">
							{[
								{ title: "Getting Started", lectures: 8, duration: "45min" },
								{
									title: "HTML Fundamentals",
									lectures: 12,
									duration: "2h 15min",
								},
								{ title: "CSS Mastery", lectures: 10, duration: "3h 30min" },
							].map((section) => (
								<div className="rounded-lg border p-4" key={section.title}>
									<div className="flex items-center justify-between">
										<h3 className="font-semibold">{section.title}</h3>
										<span className="text-muted-foreground text-sm">
											{section.lectures} lectures • {section.duration}
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
									<span className="font-bold text-3xl">$89.99</span>
									<span className="text-lg text-muted-foreground line-through">
										$199.99
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
