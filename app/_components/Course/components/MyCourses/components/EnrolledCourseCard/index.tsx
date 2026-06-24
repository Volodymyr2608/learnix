import { PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import type { EnrolledCourseCardProps } from "@/app/_components/Course/components/MyCourses/components/EnrolledCourseCard/types";
import { MessageInstructorButton } from "@/app/_components/Messaging/MessageInstructorButton";
import type { EnrolledCourse } from "@/lib/requests/course/getStudentEnrolledCourses";

function getLearnHref(course: EnrolledCourse) {
	if (course.status === "Completed") {
		return `/dashboard/courses/${course.id}/review`;
	}
	if (course.nextLessonId) {
		return `/dashboard/courses/${course.id}/learn/${course.nextLessonId}`;
	}
	return `/dashboard/courses/${course.id}/learn`;
}

function getInitials(name: string) {
	return name
		.split(" ")
		.filter(Boolean)
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

export const EnrolledCourseCard = ({ course }: EnrolledCourseCardProps) => {
	const isCompleted = course.status === "Completed";
	const learnHref = getLearnHref(course);

	return (
		<Card className="group flex flex-col gap-4 overflow-hidden pt-0 transition-shadow hover:shadow-lg">
			<Link
				className="relative block aspect-video w-full overflow-hidden bg-muted"
				href={learnHref}
			>
				<Image
					alt={course.title}
					className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
					fill
					src={course.thumbnail || "/placeholder.svg"}
				/>
				<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/10" />
				<div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
					<Badge
						className="border-transparent bg-background/80 text-foreground capitalize shadow-sm backdrop-blur-sm"
						variant="outline"
					>
						{course.category}
					</Badge>
					<Badge
						className="shadow-sm"
						variant={isCompleted ? "default" : "secondary"}
					>
						{course.status}
					</Badge>
				</div>
			</Link>
			<CardHeader className="gap-0">
				<CardTitle className="line-clamp-2 text-lg">
					<Link
						className="transition-colors hover:text-primary hover:underline"
						href={learnHref}
					>
						{course.title}
					</Link>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col space-y-4">
				<div className="space-y-1.5">
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">
							{course.completedLessons}/{course.totalLessons} lessons
						</span>
						<span className="font-semibold text-primary">
							{course.progress}%
						</span>
					</div>
					<Progress value={course.progress} />
				</div>

				<Button
					asChild
					className="mt-auto w-full"
					size="lg"
					variant={isCompleted ? "outline" : "default"}
				>
					<Link href={learnHref}>
						<PlayCircle className="mr-2 h-4 w-4" />
						{isCompleted ? "Review Course" : "Continue Learning"}
					</Link>
				</Button>

				<div className="flex items-center justify-between gap-2 border-t pt-4">
					<div className="flex min-w-0 items-center gap-2">
						<Avatar className="size-10">
							{course.instructorImage && (
								<AvatarImage
									alt={course.instructor}
									src={course.instructorImage}
								/>
							)}
							<AvatarFallback className="text-sm">
								{getInitials(course.instructor)}
							</AvatarFallback>
						</Avatar>
						<span className="truncate font-medium text-sm">
							{course.instructor}
						</span>
					</div>
					<MessageInstructorButton courseId={course.id} />
				</div>
			</CardContent>
		</Card>
	);
};
