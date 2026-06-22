import { Eye, PlayCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import {
	countLectures,
	sumTotalDurationMinutes,
} from "@/lib/course/courseStats";
import { formatDuration } from "@/lib/format/formatDuration";
import type { CourseContentCardProps, SectionBlockProps } from "./types";

function SectionBlock({ courseId, section }: SectionBlockProps) {
	return (
		<div className="rounded-lg border">
			<div className="flex items-center justify-between p-4">
				<h3 className="font-semibold">{section.title}</h3>
				<span className="text-muted-foreground text-sm">
					{section.lessons.length} lectures
				</span>
			</div>
			{section.lessons.length > 0 && (
				<div className="border-t">
					{section.lessons.map((lesson) => (
						<div
							className="flex items-center justify-between px-4 py-2 text-sm last:rounded-b-lg hover:bg-muted/50"
							key={lesson.id}
						>
							<div className="flex items-center gap-2 text-muted-foreground">
								<PlayCircle className="h-4 w-4 shrink-0" />
								<span>{lesson.title}</span>
								{lesson.durationMinutes != null && (
									<span className="text-xs">
										• {formatDuration(lesson.durationMinutes)}
									</span>
								)}
							</div>
							<Button asChild size="sm" variant="ghost">
								<Link href={INSTRUCTOR_URLS.previewLesson(courseId, lesson.id)}>
									<Eye className="mr-1 h-3 w-3" />
									Preview
								</Link>
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function CourseContentCard({
	courseId,
	sections,
}: CourseContentCardProps) {
	const lectureCount = countLectures(sections);
	const totalMinutes = sumTotalDurationMinutes(sections);
	const isEmpty = lectureCount === 0;

	return (
		<Card className="p-6">
			<h2 className="mb-4 font-bold text-2xl">Course content</h2>
			<div className="mb-4 text-muted-foreground text-sm">
				{sections.length} sections • {lectureCount} lectures •{" "}
				{formatDuration(totalMinutes)} total length
			</div>
			{isEmpty && (
				<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
					No content added yet
				</p>
			)}
			{!isEmpty && (
				<div className="space-y-2">
					{sections.map((section) => (
						<SectionBlock
							courseId={courseId}
							key={section.id}
							section={section}
						/>
					))}
				</div>
			)}
		</Card>
	);
}
