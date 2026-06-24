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
	CourseCardActionProps,
	SelectedCourse,
} from "@/app/_components/Course/components/BrowseCourses/components/BrowseCourseCard/types";
import EnrollConfirmDialog from "@/app/_components/Course/components/EnrollConfirmDialog";
import PurchaseConfirmDialog from "@/app/_components/Course/components/PurchaseConfirmDialog";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { formatPrice } from "@/lib/formatPrice";
import { capitalize } from "@/lib/utils/capitalize";

function CourseCardAction({
	course,
	isEnrolled,
	nextLessonId,
	onEnrollFree,
	onBuy,
}: CourseCardActionProps) {
	if (isEnrolled) {
		return (
			<Button asChild size="sm" variant="outline">
				<Link
					href={
						nextLessonId
							? STUDENT_URLS.learnLesson(course.id, nextLessonId)
							: STUDENT_URLS.learnCourse(course.id)
					}
				>
					Continue
				</Link>
			</Button>
		);
	}

	if (course.priceCents > 0) {
		return (
			<Button onClick={onBuy} size="sm">
				Buy now
			</Button>
		);
	}

	return (
		<Button onClick={onEnrollFree} size="sm">
			Enroll Now
		</Button>
	);
}

const BrowseCourseCard = ({
	course,
	isEnrolled,
	nextLessonId,
}: BrowseCourseCardProps) => {
	const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
	const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
	const [selectedCourse, setSelectedCourse] = useState<SelectedCourse | null>(
		null,
	);

	const handleEnrollClick = () => {
		setSelectedCourse({
			id: String(course.id),
			title: course.title,
			instructor: course.instructor,
			thumbnail: course.thumbnail,
			duration: course.duration,
			level: course.level,
		});
		setEnrollDialogOpen(true);
	};

	return (
		<>
			<Card className="group gap-4 overflow-hidden pt-0 transition-shadow duration-300 hover:shadow-lg">
				<Link className="block" href={`/dashboard/browse/${course.id}`}>
					<div className="relative aspect-video w-full overflow-hidden bg-muted">
						<Image
							alt={course.title}
							className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							fill
							src={course.thumbnail || "/placeholder.svg"}
						/>
						<div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/10" />
						<Badge
							className="absolute top-3 left-3 border-0 bg-white/85 text-foreground shadow-sm backdrop-blur-sm"
							variant="secondary"
						>
							{capitalize(course.category)}
						</Badge>
						<Badge
							className="absolute top-3 right-3 border-white/30 bg-black/40 text-white backdrop-blur-sm"
							variant="outline"
						>
							{capitalize(course.level)}
						</Badge>
					</div>
				</Link>
				<CardHeader>
					<div className="space-y-1">
						<Link href={`/dashboard/browse/${course.id}`}>
							<CardTitle className="line-clamp-2 text-lg transition-colors group-hover:text-primary">
								{course.title}
							</CardTitle>
						</Link>
						<CardDescription>by {course.instructor}</CardDescription>
					</div>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex items-center justify-between text-sm">
						<div className="flex items-center gap-1">
							{course.rating === null ? (
								<span className="text-muted-foreground">No ratings yet</span>
							) : (
								<>
									<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
									<span className="font-medium">{course.rating}</span>
								</>
							)}
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

					<div className="flex items-center justify-between border-t pt-3">
						<span className="font-bold text-xl">
							{formatPrice(course.priceCents)}
						</span>
						<CourseCardAction
							course={course}
							isEnrolled={isEnrolled}
							nextLessonId={nextLessonId}
							onBuy={() => setPurchaseDialogOpen(true)}
							onEnrollFree={handleEnrollClick}
						/>
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

			<PurchaseConfirmDialog
				course={{
					id: String(course.id),
					title: course.title,
					instructor: course.instructor,
					thumbnail: course.thumbnail,
					priceCents: course.priceCents,
				}}
				onOpenChange={setPurchaseDialogOpen}
				open={purchaseDialogOpen}
			/>
		</>
	);
};

export default BrowseCourseCard;
