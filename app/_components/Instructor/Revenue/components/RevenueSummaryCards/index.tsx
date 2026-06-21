import { Clock, DollarSign, TrendingUp, Wallet } from "lucide-react";
import DeltaBadge from "@/app/_components/Instructor/_shared/DeltaBadge";
import StatCard from "@/app/_components/Instructor/_shared/StatCard";
import { formatUsd } from "@/lib/formatUsd";
import type { RevenueSummaryCardsProps } from "./types";

export default function RevenueSummaryCards({
	summary,
}: RevenueSummaryCardsProps) {
	return (
		<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				icon={<DollarSign className="h-6 w-6 text-green-600" />}
				iconWrapperClassName="bg-green-500/10"
				label="Total Revenue"
				value={formatUsd(summary.totalGrossCents)}
			/>
			<StatCard
				icon={<TrendingUp className="h-6 w-6 text-purple-600" />}
				iconWrapperClassName="bg-purple-500/10"
				label="This Month"
				subline={<DeltaBadge delta={summary.thisMonth.delta} />}
				value={formatUsd(summary.thisMonth.grossCents)}
			/>
			<StatCard
				icon={<Wallet className="h-6 w-6 text-blue-600" />}
				iconWrapperClassName="bg-blue-500/10"
				label="Paid Out"
				value={formatUsd(summary.paidOutCents)}
			/>
			<StatCard
				icon={<Clock className="h-6 w-6 text-yellow-600" />}
				iconWrapperClassName="bg-yellow-500/10"
				label="Pending Payout"
				value={formatUsd(summary.pendingCents)}
			/>
		</div>
	);
}
