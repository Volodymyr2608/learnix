import { BookOpen, Clock, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import type { EnrolledCourseCardProps } from "@/app/_components/Course/components/MyCourses/components/EnrolledCourseCard/types";
import { MessageInstructorButton } from "@/app/_components/Messaging/MessageInstructorButton";

export const EnrolledCourseCard = ({ course }: EnrolledCourseCardProps) => {
	const learnHref =
		course.status === "Completed"
			? `/dashboard/courses/${course.id}/review`
			: course.nextLessonId
				? `/dashboard/courses/${course.id}/learn/${course.nextLessonId}`
				: `/dashboard/courses/${course.id}/learn`;

	return (
		<Card className="overflow-hidden transition-shadow hover:shadow-lg">
			<div className="relative aspect-video w-full overflow-hidden bg-muted">
				<Image
					alt={course.title}
					className="h-full w-full object-cover"
					fill
					src={course.thumbnail || "/placeholder.svg"}
				/>
			</div>
			<CardHeader>
				<div className="flex items-start justify-between gap-2">
					<div className="space-y-1">
						<CardTitle className="line-clamp-2 text-lg">
							{course.title}
						</CardTitle>
						<CardDescription>by {course.instructor}</CardDescription>
					</div>
					<Badge
						className="shrink-0"
						variant={course.status === "Completed" ? "default" : "secondary"}
					>
						{course.status}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-1.5">
					<div className="flex justify-between text-muted-foreground text-sm">
						<span>
							{course.completedLessons}/{course.totalLessons} lessons
						</span>
						<span>{course.progress}%</span>
					</div>
					<Progress value={course.progress} />
				</div>

				<div className="flex items-center gap-3 text-muted-foreground text-sm">
					<div className="flex items-center gap-1">
						<Clock className="h-4 w-4" />
						<span>{course.duration}</span>
					</div>
					<div className="flex items-center gap-1">
						<BookOpen className="h-4 w-4" />
						<span>{course.totalLessons} lessons</span>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Button
						asChild
						className="flex-1"
						variant={course.status === "Completed" ? "outline" : "default"}
					>
						<Link href={learnHref}>
							<PlayCircle className="mr-2 h-4 w-4" />
							{course.status === "Completed"
								? "Review Course"
								: "Continue Learning"}
						</Link>
					</Button>
					<MessageInstructorButton courseId={course.id} />
				</div>
			</CardContent>
		</Card>
	);
};
