"use client";

import {
	Award,
	Clock,
	Download,
	FileText,
	PlayCircle,
	Smartphone,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card, CardContent } from "@/app/_components/_shared/ui/card";
import { Separator } from "@/app/_components/_shared/ui/separator";
import type {
	CourseDetailEnrollCardProps,
	EnrollActionProps,
	IncludeItemProps,
} from "@/app/_components/Course/components/BrowseCourse/CourseDetailEnrollCard/types";
import EnrollConfirmDialog from "@/app/_components/Course/components/EnrollConfirmDialog";
import { formatPrice } from "@/lib/formatPrice";
import { api } from "@/trpc/client";

function IncludeItem({ icon: Icon, label }: IncludeItemProps) {
	return (
		<div className="flex items-center gap-2">
			<Icon className="h-4 w-4 text-muted-foreground" />
			<span>{label}</span>
		</div>
	);
}

function EnrollAction({
	course,
	isEnrolled,
	nextLessonId,
	onEnrollFree,
}: EnrollActionProps) {
	const checkout = api.payment.createCheckoutSession.useMutation({
		onSuccess: ({ url }) => {
			window.location.href = url;
		},
		onError: (err) => {
			toast.error(err.message || "Failed to start checkout. Please try again.");
		},
	});

	if (isEnrolled) {
		return (
			<Button asChild className="w-full" size="lg">
				<Link
					href={
						nextLessonId
							? `/dashboard/courses/${course.id}/learn/${nextLessonId}`
							: `/dashboard/courses/${course.id}/learn`
					}
				>
					<PlayCircle className="mr-2 h-5 w-5" />
					Continue Learning
				</Link>
			</Button>
		);
	}

	if (course.priceCents > 0) {
		return (
			<Button
				className="w-full"
				disabled={checkout.isPending}
				onClick={() => checkout.mutate({ courseId: course.id })}
				size="lg"
			>
				{checkout.isPending
					? "Redirecting..."
					: `Buy now — ${formatPrice(course.priceCents)}`}
			</Button>
		);
	}

	return (
		<Button className="w-full" onClick={onEnrollFree} size="lg">
			Enroll Now
		</Button>
	);
}

const CourseDetailEnrollCard = ({
	course,
	previewMode,
	isEnrolled = false,
	nextLessonId = null,
}: CourseDetailEnrollCardProps) => {
	const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);

	return (
		<>
			<Card>
				<div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-muted">
					<Image
						alt={course.title}
						className="h-full w-full object-cover"
						fill
						src={course.thumbnail || "/placeholder.svg"}
					/>
					<div className="absolute inset-0 flex items-center justify-center bg-black/30">
						<Button className="gap-2" size="lg" variant="secondary">
							<PlayCircle className="h-5 w-5" />
							Preview Course
						</Button>
					</div>
				</div>
				<CardContent className="space-y-4 p-6">
					<div className="space-y-2">
						<div className="flex items-baseline gap-2">
							<span className="font-bold text-3xl">
								{formatPrice(course.priceCents)}
							</span>
							{course.originalPriceCents && (
								<>
									<span className="text-lg text-muted-foreground line-through">
										{formatPrice(course.originalPriceCents)}
									</span>
									<Badge variant="destructive">
										{Math.round(
											((course.originalPriceCents - course.priceCents) /
												course.originalPriceCents) *
												100,
										)}
										% OFF
									</Badge>
								</>
							)}
						</div>
					</div>

					{previewMode ? (
						<Button className="w-full" disabled size="lg">
							Preview Mode — Not Purchasable
						</Button>
					) : (
						<EnrollAction
							course={course}
							isEnrolled={isEnrolled}
							nextLessonId={nextLessonId}
							onEnrollFree={() => setEnrollDialogOpen(true)}
						/>
					)}

					<p className="text-center text-muted-foreground text-xs">
						30-Day Money-Back Guarantee
					</p>

					<Separator />

					<div className="space-y-3 text-sm">
						<h4 className="font-semibold">This course includes:</h4>
						<div className="space-y-2">
							{course.includes.videoDuration !== "—" && (
								<IncludeItem
									icon={PlayCircle}
									label={`${course.includes.videoDuration} of on-demand video`}
								/>
							)}
							{course.includes.lectureCount > 0 && (
								<IncludeItem
									icon={FileText}
									label={`${course.includes.lectureCount} ${
										course.includes.lectureCount === 1 ? "lecture" : "lectures"
									}`}
								/>
							)}
							{course.includes.resourceCount > 0 && (
								<IncludeItem
									icon={Download}
									label={`${course.includes.resourceCount} downloadable ${
										course.includes.resourceCount === 1
											? "resource"
											: "resources"
									}`}
								/>
							)}
							<IncludeItem icon={Clock} label="Full lifetime access" />
							<IncludeItem icon={Smartphone} label="Access on mobile and TV" />
							<IncludeItem icon={Award} label="Certificate of completion" />
						</div>
					</div>
				</CardContent>
			</Card>

			<EnrollConfirmDialog
				course={{
					id: course.id,
					title: course.title,
					instructor: course.instructor.name,
					thumbnail: course.thumbnail,
					duration: course.duration,
					level: course.level,
				}}
				onOpenChange={setEnrollDialogOpen}
				open={enrollDialogOpen}
			/>
		</>
	);
};

export default CourseDetailEnrollCard;
