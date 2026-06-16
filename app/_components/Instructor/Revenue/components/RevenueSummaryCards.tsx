import {
	ArrowDownRight,
	ArrowUpRight,
	Clock,
	DollarSign,
	TrendingUp,
	Wallet,
} from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import { formatUsd } from "@/lib/formatUsd";
import type {
	DeltaBadgeProps,
	RevenueSummaryCardsProps,
	StatCardProps,
} from "../types";

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
	if (delta.kind === "percent") {
		if (delta.direction === "flat") {
			return (
				<p className="mt-2 text-muted-foreground text-sm">
					No change from last month
				</p>
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
	return null;
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

export default function RevenueSummaryCards({
	summary,
	isLoading,
}: RevenueSummaryCardsProps) {
	const s = summary;
	return (
		<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				icon={<DollarSign className="h-6 w-6 text-green-600" />}
				iconWrapperClassName="bg-green-500/10"
				label="Total Revenue"
				value={isLoading || !s ? "—" : formatUsd(s.totalGrossCents)}
			/>
			<StatCard
				icon={<TrendingUp className="h-6 w-6 text-purple-600" />}
				iconWrapperClassName="bg-purple-500/10"
				label="This Month"
				subline={s ? <DeltaBadge delta={s.thisMonth.delta} /> : null}
				value={isLoading || !s ? "—" : formatUsd(s.thisMonth.grossCents)}
			/>
			<StatCard
				icon={<Wallet className="h-6 w-6 text-blue-600" />}
				iconWrapperClassName="bg-blue-500/10"
				label="Paid Out"
				value={isLoading || !s ? "—" : formatUsd(s.paidOutCents)}
			/>
			<StatCard
				icon={<Clock className="h-6 w-6 text-yellow-600" />}
				iconWrapperClassName="bg-yellow-500/10"
				label="Pending Payout"
				value={isLoading || !s ? "—" : formatUsd(s.pendingCents)}
			/>
		</div>
	);
}
