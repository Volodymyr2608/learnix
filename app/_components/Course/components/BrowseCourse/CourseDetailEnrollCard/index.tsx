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
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card, CardContent } from "@/app/_components/_shared/ui/card";
import { Separator } from "@/app/_components/_shared/ui/separator";
import type { CourseDetailEnrollCardProps } from "@/app/_components/Course/components/BrowseCourse/CourseDetailEnrollCard/types";
import EnrollConfirmDialog from "@/app/_components/Course/components/EnrollConfirmDialog";

const CourseDetailEnrollCard = ({ course }: CourseDetailEnrollCardProps) => {
	const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);

	const isEnrolled = false;

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
							<span className="font-bold text-3xl">${course.price}</span>

							{course.originalPrice && (
								<>
									<span className="text-lg text-muted-foreground line-through">
										${course.originalPrice}
									</span>
									<Badge variant="destructive">
										{Math.round(
											((course.originalPrice - course.price) /
												course.originalPrice) *
												100,
										)}
										% OFF
									</Badge>
								</>
							)}
						</div>
						<p className="font-medium text-destructive text-sm">
							2 days left at this price!
						</p>
					</div>

					{isEnrolled ? (
						<Button asChild className="w-full" size="lg">
							<Link href={`/dashboard/courses/${course.id}/learn`}>
								<PlayCircle className="mr-2 h-5 w-5" />
								Continue Learning
							</Link>
						</Button>
					) : (
						<Button
							className="w-full"
							onClick={() => setEnrollDialogOpen(true)}
							size="lg"
						>
							Enroll Now
						</Button>
					)}

					<p className="text-center text-muted-foreground text-xs">
						30-Day Money-Back Guarantee
					</p>

					<Separator />

					<div className="space-y-3 text-sm">
						<h4 className="font-semibold">This course includes:</h4>
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<PlayCircle className="h-4 w-4 text-muted-foreground" />
								<span>{course.duration} on-demand video</span>
							</div>
							<div className="flex items-center gap-2">
								<FileText className="h-4 w-4 text-muted-foreground" />
								<span>12 articles</span>
							</div>
							<div className="flex items-center gap-2">
								<Download className="h-4 w-4 text-muted-foreground" />
								<span>15 downloadable resources</span>
							</div>
							<div className="flex items-center gap-2">
								<Clock className="h-4 w-4 text-muted-foreground" />
								<span>Full lifetime access</span>
							</div>
							<div className="flex items-center gap-2">
								<Smartphone className="h-4 w-4 text-muted-foreground" />
								<span>Access on mobile and TV</span>
							</div>
							<div className="flex items-center gap-2">
								<Award className="h-4 w-4 text-muted-foreground" />
								<span>Certificate of completion</span>
							</div>
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
