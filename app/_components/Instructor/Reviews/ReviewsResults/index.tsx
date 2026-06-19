"use client";

import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/app/_components/_shared/ui/tabs";
import { useReviewsUrl } from "../hooks/useReviewsUrl";
import { ReviewCard } from "../ReviewCard";
import type { ReviewsResultsProps } from "../types";

const RATING_TABS = ["all", "5", "4", "3", "2", "1"] as const;

export function ReviewsResults({ reviews, query }: ReviewsResultsProps) {
	const { update, isPending } = useReviewsUrl();

	return (
		<div className="space-y-4">
			<Tabs onValueChange={(rating) => update({ rating })} value={query.rating}>
				<TabsList>
					{RATING_TABS.map((t) => (
						<TabsTrigger key={t} value={t}>
							{t === "all" ? "All" : `${t} star`}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{reviews.data.length === 0 && (
				<Card className="p-12 text-center text-muted-foreground">
					No reviews match your filters.
				</Card>
			)}

			{reviews.data.map((review) => (
				<ReviewCard key={review.id} review={review} />
			))}

			{reviews.lastPage > 1 && (
				<div className="flex items-center justify-between pt-2">
					<Button
						disabled={isPending || query.page <= 1}
						onClick={() => update({ page: query.page - 1 })}
						size="sm"
						variant="outline"
					>
						Previous
					</Button>
					<span className="text-muted-foreground text-sm">
						Page {reviews.currentPage} of {reviews.lastPage}
					</span>
					<Button
						disabled={isPending || query.page >= reviews.lastPage}
						onClick={() => update({ page: query.page + 1 })}
						size="sm"
						variant="outline"
					>
						Next
					</Button>
				</div>
			)}
		</div>
	);
}
