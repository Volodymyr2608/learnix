"use client";

import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { EditCourseForm } from "@/app/_components/Course/EditCourseForm";
import DASHBOARD_URLS from "@/lib/constants/urls/dashboardUrls";

export default async function InstructorEditCoursePage({
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
						<h1 className="font-bold text-3xl tracking-tight">Edit Course</h1>
						<p className="text-muted-foreground">Update your course details</p>
					</div>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link href={DASHBOARD_URLS.previewCourse(courseId)}>
							<Eye className="mr-2 h-4 w-4" />
							Preview
						</Link>
					</Button>
				</div>
			</div>

			<div className="rounded-lg bg-blue-50 p-4 text-blue-900 text-sm dark:bg-blue-950 dark:text-blue-100">
				Editing: <strong>Complete Web Development Bootcamp</strong>
			</div>

			<EditCourseForm courseId={courseId} />
		</div>
	);
}
