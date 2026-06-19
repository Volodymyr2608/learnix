import { MessageSquare, Star, ThumbsDown, TrendingUp } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import { cn } from "@/lib/utils/cn";
import { Stars } from "../Stars";
import type { ReviewsStatsProps, StatCardProps } from "../types";

function StatCard({ label, value, tint, icon }: StatCardProps) {
	return (
		<Card className="p-6">
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium text-muted-foreground text-sm">{label}</p>
					<p className="mt-2 font-bold text-3xl">{value}</p>
				</div>
				<div
					className={cn(
						"flex h-12 w-12 items-center justify-center rounded-full",
						tint,
					)}
				>
					{icon}
				</div>
			</div>
		</Card>
	);
}

export function ReviewsStats({ stats }: ReviewsStatsProps) {
	const average = stats.average ?? 0;

	return (
		<>
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
				<StatCard
					icon={<Star className="h-6 w-6" />}
					label="Average Rating"
					tint="bg-yellow-500/10 text-yellow-600"
					value={average.toFixed(1)}
				/>
				<StatCard
					icon={<MessageSquare className="h-6 w-6" />}
					label="Total Reviews"
					tint="bg-blue-500/10 text-blue-600"
					value={stats.total.toString()}
				/>
				<StatCard
					icon={<TrendingUp className="h-6 w-6" />}
					label="5-Star Reviews"
					tint="bg-green-500/10 text-green-600"
					value={`${stats.fiveStarPercent}%`}
				/>
				<StatCard
					icon={<ThumbsDown className="h-6 w-6" />}
					label="Low Ratings (≤2★)"
					tint="bg-red-500/10 text-red-600"
					value={stats.lowRatingCount.toString()}
				/>
			</div>

			<Card className="grid gap-8 p-6 md:grid-cols-3">
				<div className="flex flex-col items-center justify-center text-center">
					<p className="font-bold text-5xl">{average.toFixed(1)}</p>
					<Stars className="mt-2" rating={Math.round(average)} />
					<p className="mt-2 text-muted-foreground text-sm">
						Based on {stats.total} reviews
					</p>
				</div>
				<div className="space-y-2 md:col-span-2">
					{stats.distribution.map((d) => (
						<div className="flex items-center gap-3" key={d.star}>
							<span className="flex w-12 items-center gap-1 text-muted-foreground text-sm">
								{d.star}
								<Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
							</span>
							<Progress className="h-2 flex-1" value={d.percent} />
							<span className="w-8 text-right text-muted-foreground text-sm">
								{d.count}
							</span>
						</div>
					))}
				</div>
			</Card>
		</>
	);
}
