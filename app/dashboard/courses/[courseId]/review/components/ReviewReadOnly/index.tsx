import { Star } from "lucide-react";
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
import type { ReviewReadOnlyProps } from "./types";

const ReviewReadOnly = ({ course, review }: ReviewReadOnlyProps) => {
	return (
		<div className="mx-auto max-w-3xl space-y-6">
			<div>
				<h1 className="font-bold text-2xl tracking-tight">Your Review</h1>
				<p className="text-muted-foreground text-sm">
					You already reviewed {course.title}
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-xl">{course.title}</CardTitle>
					<CardDescription>by {course.instructor}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center gap-1">
						{[1, 2, 3, 4, 5].map((star) => (
							<Star
								className={
									star <= review.rating
										? "h-6 w-6 fill-yellow-400 text-yellow-400"
										: "h-6 w-6 text-muted-foreground"
								}
								key={star}
							/>
						))}
					</div>
					<p className="text-muted-foreground text-sm">{review.comment}</p>
					{review.tags.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{review.tags.map((tag) => (
								<Badge key={tag} variant="secondary">
									{tag.replace(/_/g, " ").toLowerCase()}
								</Badge>
							))}
						</div>
					)}
					<Button asChild variant="outline">
						<Link href="/dashboard/courses">Back to My Courses</Link>
					</Button>
				</CardContent>
			</Card>
		</div>
	);
};

export default ReviewReadOnly;
