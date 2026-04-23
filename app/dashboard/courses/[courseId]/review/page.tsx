"use client";

import { CheckCircle2, ChevronLeft, Star } from "lucide-react";
import type React from "react";
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
import { Label } from "@/app/_components/_shared/ui/label";
import { Textarea } from "@/app/_components/_shared/ui/textarea";

export default function ReviewCoursePage({
	params,
}: {
	params: { courseId: string };
}) {
	const [rating, setRating] = useState(0);
	const [hoveredRating, setHoveredRating] = useState(0);
	const [review, setReview] = useState("");
	const [submitted, setSubmitted] = useState(false);

	// Mock course data
	const course = {
		id: params.courseId,
		title: "Python for Data Science",
		instructor: "David Kim",
		completedDate: "March 15, 2024",
		totalLessons: 30,
		duration: "15 hours",
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		// Handle review submission
		setSubmitted(true);
	};

	if (submitted) {
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
									helps us improve the learning experience for everyone.
								</p>
							</div>
							<div className="flex gap-3">
								<Button asChild variant="outline">
									<a href="/dashboard/courses">Back to My Courses</a>
								</Button>
								<Button asChild>
									<a href="/dashboard/browse">Browse More Courses</a>
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
			{/* Header */}
			<div className="flex items-center gap-2">
				<Button asChild size="icon" variant="ghost">
					<a href="/dashboard/courses">
						<ChevronLeft className="h-4 w-4" />
					</a>
				</Button>
				<div>
					<h1 className="font-bold text-2xl tracking-tight">Review Course</h1>
					<p className="text-muted-foreground text-sm">
						Share your experience with other learners
					</p>
				</div>
			</div>

			{/* Course Info */}
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

			{/* Review Form */}
			<form onSubmit={handleSubmit}>
				<Card>
					<CardHeader>
						<CardTitle>Your Review</CardTitle>
						<CardDescription>
							Help others by sharing your honest feedback
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{/* Rating */}
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
											className={`h-8 w-8 ${
												star <= (hoveredRating || rating)
													? "fill-yellow-400 text-yellow-400"
													: "text-muted-foreground"
											}`}
										/>
									</button>
								))}
								{rating > 0 && (
									<span className="ml-2 font-medium text-sm">
										{rating === 5
											? "Excellent!"
											: rating === 4
												? "Very Good"
												: rating === 3
													? "Good"
													: rating === 2
														? "Fair"
														: "Poor"}
									</span>
								)}
							</div>
						</div>

						{/* Review Text */}
						<div className="space-y-2">
							<Label htmlFor="review">Your Review *</Label>
							<Textarea
								id="review"
								onChange={(e) => setReview(e.target.value)}
								placeholder="Share your experience with this course. What did you like? What could be improved?"
								required
								rows={6}
								value={review}
							/>
							<p className="text-muted-foreground text-xs">
								Minimum 50 characters
							</p>
						</div>

						{/* Quick Feedback */}
						<div className="space-y-2">
							<Label>What did you like most? (Optional)</Label>
							<div className="flex flex-wrap gap-2">
								{[
									"Course Content",
									"Instructor",
									"Practical Examples",
									"Pace",
									"Resources",
									"Exercises",
								].map((tag) => (
									<Button key={tag} size="sm" type="button" variant="outline">
										{tag}
									</Button>
								))}
							</div>
						</div>

						{/* Submit Button */}
						<div className="flex gap-3 pt-4">
							<Button
								asChild
								className="flex-1 bg-transparent"
								type="button"
								variant="outline"
							>
								<a href="/dashboard/courses">Cancel</a>
							</Button>
							<Button
								className="flex-1"
								disabled={rating === 0 || review.length < 50}
								type="submit"
							>
								Submit Review
							</Button>
						</div>
					</CardContent>
				</Card>
			</form>
		</div>
	);
}
