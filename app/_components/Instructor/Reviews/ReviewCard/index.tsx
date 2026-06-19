import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/app/_components/_shared/ui/avatar";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Card } from "@/app/_components/_shared/ui/card";
import { Stars } from "../Stars";
import type { ReviewCardProps } from "../types";

function initials(name: string): string {
	return name
		.split(" ")
		.map((part) => part[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function formatTag(tag: string): string {
	return tag.toLowerCase().split("_").join(" ");
}

export function ReviewCard({ review }: ReviewCardProps) {
	return (
		<Card className="p-6">
			<div className="flex gap-4">
				<Avatar>
					<AvatarFallback className="bg-muted font-medium text-sm">
						{initials(review.studentName)}
					</AvatarFallback>
				</Avatar>
				<div>
					<p className="font-semibold">{review.studentName}</p>
					<p className="text-muted-foreground text-sm">{review.courseTitle}</p>
					<div className="mt-2 flex items-center gap-2">
						<Stars rating={review.rating} />
						<span className="text-muted-foreground text-sm">
							{format(review.createdAt, "MMM d, yyyy")}
						</span>
					</div>
				</div>
			</div>

			<p className="mt-4 text-muted-foreground text-sm leading-relaxed">
				{review.comment}
			</p>

			{review.tags.length > 0 && (
				<div className="mt-4 flex flex-wrap gap-2">
					{review.tags.map((tag) => (
						<Badge className="capitalize" key={tag} variant="secondary">
							{formatTag(tag)}
						</Badge>
					))}
				</div>
			)}
		</Card>
	);
}
