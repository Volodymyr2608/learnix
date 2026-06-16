import {
	ArrowDownRight,
	ArrowUpRight,
	BookOpen,
	DollarSign,
	Star,
	Users,
} from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import type {
	DashboardStatsCardsProps,
	DeltaBadgeProps,
	RatingSublineProps,
	StatCardProps,
} from "./types";

/**
 * USD whole-dollar formatting for revenue. Unlike lib/formatPrice, this shows
 * "$0" (not "Free") for zero, which the Total Revenue card requires.
 */
function formatUsd(cents: number): string {
	return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function DeltaBadge({ delta }: DeltaBadgeProps) {
	if (delta.kind === "none") return null;
	if (delta.kind === "new") {
		return (
			<div className="mt-2 flex items-center gap-1 text-green-600 text-sm">
				<ArrowUpRight className="h-4 w-4" />
				<span>New this month</span>
			</div>
		);
	}
	if (delta.direction === "flat") {
		return (
			<div className="mt-2 flex items-center gap-1 text-muted-foreground text-sm">
				<span>No change from last month</span>
			</div>
		);
	}
	const isUp = delta.direction === "up";
	const Icon = isUp ? ArrowUpRight : ArrowDownRight;
	return (
		<div
			className={`mt-2 flex items-center gap-1 text-sm ${isUp ? "text-green-600" : "text-red-600"}`}
		>
			<Icon className="h-4 w-4" />
			<span>{Math.abs(delta.value)}% from last month</span>
		</div>
	);
}

function StatCard({
	label,
	value,
	icon,
	iconWrapperClassName,
	subline,
}: StatCardProps) {
	return (
		<Card className="p-6">
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium text-muted-foreground text-sm">{label}</p>
					<p className="mt-2 font-bold text-3xl">{value}</p>
					{subline}
				</div>
				<div
					className={`flex h-12 w-12 items-center justify-center rounded-full ${iconWrapperClassName}`}
				>
					{icon}
				</div>
			</div>
		</Card>
	);
}

function RatingSubline({ reviewCount }: RatingSublineProps) {
	if (reviewCount === 0) {
		return <p className="mt-2 text-muted-foreground text-sm">No reviews yet</p>;
	}
	return (
		<div className="mt-2 flex items-center gap-1 text-sm text-yellow-600">
			<Star className="h-4 w-4 fill-yellow-600" />
			<span>{reviewCount} reviews</span>
		</div>
	);
}

export default function DashboardStatsCards({
	stats,
}: DashboardStatsCardsProps) {
	const { revenue, students, courses, rating } = stats;
	return (
		<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				icon={<DollarSign className="h-6 w-6 text-green-600" />}
				iconWrapperClassName="bg-green-500/10"
				label="Total Revenue"
				subline={<DeltaBadge delta={revenue.delta} />}
				value={formatUsd(revenue.totalCents)}
			/>
			<StatCard
				icon={<Users className="h-6 w-6 text-blue-600" />}
				iconWrapperClassName="bg-blue-500/10"
				label="Total Students"
				subline={<DeltaBadge delta={students.delta} />}
				value={students.total.toLocaleString()}
			/>
			<StatCard
				icon={<BookOpen className="h-6 w-6 text-purple-600" />}
				iconWrapperClassName="bg-purple-500/10"
				label="Active Courses"
				subline={
					<p className="mt-2 text-muted-foreground text-sm">
						{courses.drafts} drafts
					</p>
				}
				value={courses.published.toLocaleString()}
			/>
			<StatCard
				icon={<Star className="h-6 w-6 text-yellow-600" />}
				iconWrapperClassName="bg-yellow-500/10"
				label="Avg. Rating"
				subline={<RatingSubline reviewCount={rating.reviewCount} />}
				value={rating.average === null ? "—" : rating.average.toFixed(1)}
			/>
		</div>
	);
}
