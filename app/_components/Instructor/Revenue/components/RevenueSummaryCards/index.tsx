import { Clock, DollarSign, TrendingUp, Wallet } from "lucide-react";
import { formatUsd } from "@/lib/formatUsd";
import DeltaBadge from "./components/DeltaBadge";
import StatCard from "./components/StatCard";
import type { RevenueSummaryCardsProps } from "./types";

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
