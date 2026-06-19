"use client";

import { CheckCircle2, ChevronLeft, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Label } from "@/app/_components/_shared/ui/label";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import { ReviewTag } from "@/generated/prisma";
import { api } from "@/trpc/client";
import type { ReviewFormProps, TagOption } from "./types";

const TAG_OPTIONS: TagOption[] = [
	{ value: ReviewTag.COURSE_CONTENT, label: "Course Content" },
	{ value: ReviewTag.INSTRUCTOR, label: "Instructor" },
	{ value: ReviewTag.PRACTICAL_EXAMPLES, label: "Practical Examples" },
	{ value: ReviewTag.PACE, label: "Pace" },
	{ value: ReviewTag.RESOURCES, label: "Resources" },
	{ value: ReviewTag.EXERCISES, label: "Exercises" },
];

const RATING_LABELS: Record<number, string> = {
	1: "Poor",
	2: "Fair",
	3: "Good",
	4: "Very Good",
	5: "Excellent!",
};

const ReviewForm = ({ course }: ReviewFormProps) => {
	const [rating, setRating] = useState(0);
	const [hoveredRating, setHoveredRating] = useState(0);
	const [comment, setComment] = useState("");
	const [tags, setTags] = useState<ReviewTag[]>([]);

	const createReview = api.review.create.useMutation({
		onError: (err) => {
			toast.error(err.message || "Failed to submit review. Please try again.");
		},
	});

	const toggleTag = (tag: ReviewTag) => {
		setTags((current) =>
			current.includes(tag)
				? current.filter((t) => t !== tag)
				: [...current, tag],
		);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		createReview.mutate({ courseId: course.id, rating, comment, tags });
	};

	if (createReview.isSuccess) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<Card className="w-full max-w-md">
					<CardContent className="pt-6">
						<div className="flex flex-col items-center space-y-4 text-center">
							<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
								<CheckCircle2 className="h-8 w-8 text-primary" />
							</div>
							<div className="space-y-2">
								<h2 className="font-bold text-2xl">Thank You!</h2>
								<p className="text-muted-foreground">
									Your review has been submitted successfully. Your feedback
									helps other learners choose the right course.
								</p>
							</div>
							<div className="flex gap-3">
								<Button asChild variant="outline">
									<Link href="/dashboard/courses">Back to My Courses</Link>
								</Button>
								<Button asChild>
									<Link href="/dashboard/browse">Browse More Courses</Link>
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-3xl space-y-6">
			<div className="flex items-center gap-2">
				<Button asChild size="icon" variant="ghost">
					<Link href="/dashboard/courses">
						<ChevronLeft className="h-4 w-4" />
					</Link>
				</Button>
				<div>
					<h1 className="font-bold text-2xl tracking-tight">Review Course</h1>
					<p className="text-muted-foreground text-sm">
						Share your experience with other learners
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-start justify-between">
						<div className="space-y-1">
							<CardTitle className="text-xl">{course.title}</CardTitle>
							<CardDescription>by {course.instructor}</CardDescription>
						</div>
						<Badge variant="default">Completed</Badge>
					</div>
				</CardHeader>
				<CardContent>
					<div className="flex gap-6 text-muted-foreground text-sm">
						<div>
							<span className="font-medium">Completed:</span>{" "}
							{course.completedDate}
						</div>
						<div>
							<span className="font-medium">Lessons:</span>{" "}
							{course.totalLessons}
						</div>
						<div>
							<span className="font-medium">Duration:</span> {course.duration}
						</div>
					</div>
				</CardContent>
			</Card>

			<form onSubmit={handleSubmit}>
				<Card>
					<CardHeader>
						<CardTitle>Your Review</CardTitle>
						<CardDescription>
							Help others by sharing your honest feedback
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-2">
							<Label>Overall Rating *</Label>
							<div className="flex items-center gap-2">
								{[1, 2, 3, 4, 5].map((star) => (
									<button
										className="transition-transform hover:scale-110"
										key={star}
										onClick={() => setRating(star)}
										onMouseEnter={() => setHoveredRating(star)}
										onMouseLeave={() => setHoveredRating(0)}
										type="button"
									>
										<Star
											className={
												star <= (hoveredRating || rating)
													? "h-8 w-8 fill-yellow-400 text-yellow-400"
													: "h-8 w-8 text-muted-foreground"
											}
										/>
									</button>
								))}
								{rating > 0 && (
									<span className="ml-2 font-medium text-sm">
										{RATING_LABELS[rating]}
									</span>
								)}
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="review">Your Review *</Label>
							<Textarea
								id="review"
								onChange={(e) => setComment(e.target.value)}
								placeholder="Share your experience with this course. What did you like? What could be improved?"
								required
								rows={6}
								value={comment}
							/>
							<p className="text-muted-foreground text-xs">
								Minimum 50 characters
							</p>
						</div>

						<div className="space-y-2">
							<Label>What did you like most? (Optional)</Label>
							<div className="flex flex-wrap gap-2">
								{TAG_OPTIONS.map((tag) => (
									<Button
										key={tag.value}
										onClick={() => toggleTag(tag.value)}
										size="sm"
										type="button"
										variant={tags.includes(tag.value) ? "default" : "outline"}
									>
										{tag.label}
									</Button>
								))}
							</div>
						</div>

						<div className="flex gap-3 pt-4">
							<Button
								asChild
								className="flex-1 bg-transparent"
								type="button"
								variant="outline"
							>
								<Link href="/dashboard/courses">Cancel</Link>
							</Button>
							<Button
								className="flex-1"
								disabled={
									rating === 0 || comment.length < 50 || createReview.isPending
								}
								type="submit"
							>
								{createReview.isPending ? "Submitting..." : "Submit Review"}
							</Button>
						</div>
					</CardContent>
				</Card>
			</form>
		</div>
	);
};

export default ReviewForm;
