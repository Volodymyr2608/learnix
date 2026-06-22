import { CheckCircle, Clock, Star, Users } from "lucide-react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Card } from "@/app/_components/_shared/ui/card";
import { capitalize } from "@/lib/utils/capitalize";
import type { PreviewHeroProps } from "./types";

export function PreviewHero({
	category,
	title,
	description,
	averageRating,
	reviewsCount,
	studentCount,
	duration,
	objectives,
}: PreviewHeroProps) {
	return (
		<>
			<div className="space-y-4">
				<Badge>{capitalize(category)}</Badge>
				<h1 className="font-bold text-4xl">{title}</h1>
				<p className="text-lg text-muted-foreground">{description}</p>

				<div className="flex flex-wrap items-center gap-4 text-sm">
					<div className="flex items-center gap-1">
						<Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
						<span className="font-semibold">{averageRating.toFixed(1)}</span>
						<span className="text-muted-foreground">
							({reviewsCount} ratings)
						</span>
					</div>
					<div className="flex items-center gap-1">
						<Users className="h-4 w-4" />
						<span>{studentCount} students</span>
					</div>
					<div className="flex items-center gap-1">
						<Clock className="h-4 w-4" />
						<span>{duration} hours</span>
					</div>
				</div>
			</div>

			<Card className="p-6">
				<h2 className="mb-4 font-bold text-2xl">What you'll learn</h2>
				<div className="grid gap-3 md:grid-cols-2">
					{objectives.map((item) => (
						<div className="flex gap-2" key={item}>
							<CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
							<span className="text-sm">{item}</span>
						</div>
					))}
				</div>
			</Card>
		</>
	);
}
