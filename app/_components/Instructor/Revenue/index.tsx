"use client";

import { useState } from "react";
import type { RevenueRange } from "@/server/entities/payment/revenue";
import { api } from "@/trpc/client";
import RevenueByCourseChart from "./components/RevenueByCourseChart";
import RevenueOverTimeChart from "./components/RevenueOverTimeChart";
import RevenuePayouts from "./components/RevenuePayouts";
import RevenueRangeSelect from "./components/RevenueRangeSelect";
import RevenueSummaryCards from "./components/RevenueSummaryCards";
import RevenueTransactionsTable from "./components/RevenueTransactionsTable";

export default function RevenueOverview() {
	const [range, setRange] = useState<RevenueRange>("12m");

	const summary = api.payment.getRevenueSummary.useQuery();
	const series = api.payment.getRevenueTimeSeries.useQuery({ range });
	const byCourse = api.payment.getRevenueByCourse.useQuery({ range });
	const transactions = api.payment.getRecentTransactions.useQuery({
		limit: 10,
	});

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="font-bold text-3xl">Revenue</h1>
					<p className="text-muted-foreground">
						Track your earnings, payouts, and transactions.
					</p>
				</div>
				<RevenueRangeSelect onChange={setRange} value={range} />
			</div>

			<RevenueSummaryCards
				isLoading={summary.isLoading}
				summary={summary.data}
			/>

			<RevenuePayouts />

			<div className="grid gap-6 lg:grid-cols-3">
				<RevenueOverTimeChart data={series.data} isLoading={series.isLoading} />
				<RevenueByCourseChart
					data={byCourse.data}
					isLoading={byCourse.isLoading}
				/>
			</div>

			<RevenueTransactionsTable
				isLoading={transactions.isLoading}
				transactions={transactions.data}
			/>
		</div>
	);
}
