"use client";

import { Clock, Star, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type {
	BrowseCourseCardProps,
	SelectedCourse,
} from "@/app/_components/Course/components/BrowseCourses/components/BrowseCourseCard/types";
import EnrollConfirmDialog from "@/app/_components/Course/components/EnrollConfirmDialog";
import { formatPrice } from "@/lib/formatPrice";
import { capitalize } from "@/lib/utils/capitalize";

const BrowseCourseCard = ({
	course,
	isEnrolled,
	nextLessonId,
}: BrowseCourseCardProps) => {
	const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
	const [selectedCourse, setSelectedCourse] = useState<SelectedCourse | null>(
		null,
	);

	const handleEnrollClick = (course: typeof selectedCourse) => {
		setSelectedCourse(course);
		setEnrollDialogOpen(true);
	};

	return (
		<>
			<Card className="overflow-hidden transition-shadow hover:shadow-lg">
				<Link className="block" href={`/dashboard/browse/${course.id}`}>
					<div className="relative aspect-video w-full overflow-hidden bg-muted">
						<Image
							alt={course.title}
							className="h-full w-full object-cover"
							fill
							src={course.thumbnail || "/placeholder.svg"}
						/>
					</div>
				</Link>
				<CardHeader>
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Badge variant="secondary">{capitalize(course.category)}</Badge>
							<Badge variant="outline">{capitalize(course.level)}</Badge>
						</div>
						<Link href={`/dashboard/browse/${course.id}`}>
							<CardTitle className="line-clamp-2 text-lg transition-colors hover:text-primary">
								{course.title}
							</CardTitle>
						</Link>
						<CardDescription>by {course.instructor}</CardDescription>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between text-sm">
						<div className="flex items-center gap-1">
							<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
							<span className="font-medium">{course.rating}</span>
						</div>
						<div className="flex items-center gap-1 text-muted-foreground">
							<Users className="h-4 w-4" />
							<span>{course.students.toLocaleString()}</span>
						</div>
						<div className="flex items-center gap-1 text-muted-foreground">
							<Clock className="h-4 w-4" />
							<span>{course.duration} hours</span>
						</div>
					</div>

					<div className="flex items-center justify-between">
						<span className="font-bold text-xl">
							{formatPrice(course.priceCents)}
						</span>
						{isEnrolled ? (
							<Button asChild size="sm" variant="outline">
								<Link
									href={
										nextLessonId
											? `/dashboard/courses/${course.id}/learn/${nextLessonId}`
											: `/dashboard/courses/${course.id}/learn`
									}
								>
									Continue
								</Link>
							</Button>
						) : (
							<Button
								onClick={() =>
									handleEnrollClick({
										id: String(course.id),
										title: course.title,
										instructor: course.instructor,
										thumbnail: course.thumbnail,
										duration: course.duration,
										level: course.level,
									})
								}
								size="sm"
							>
								Enroll Now
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			{selectedCourse && (
				<EnrollConfirmDialog
					course={selectedCourse}
					onOpenChange={setEnrollDialogOpen}
					open={enrollDialogOpen}
				/>
			)}
		</>
	);
};

export default BrowseCourseCard;
