"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import { useReviewsUrl } from "../hooks/useReviewsUrl";
import type { ReviewsFiltersProps } from "../types";

export function ReviewsFilters({ courses, query }: ReviewsFiltersProps) {
	const { update } = useReviewsUrl();

	return (
		<Select
			onValueChange={(courseId) => update({ courseId })}
			value={query.courseId}
		>
			<SelectTrigger className="w-full sm:w-64">
				<SelectValue placeholder="All courses" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">All courses</SelectItem>
				{courses.map((c) => (
					<SelectItem key={c.id} value={c.id}>
						{c.title}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
