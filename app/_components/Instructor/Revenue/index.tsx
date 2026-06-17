import { PageShell } from "@/app/_components/_shared/components/PageShell";
import getConnectStatus from "@/lib/requests/instructor/getConnectStatus";
import getRecentTransactions from "@/lib/requests/instructor/getRecentTransactions";
import getRevenueSummary from "@/lib/requests/instructor/getRevenueSummary";
import RevenueCharts from "./components/RevenueCharts";
import RevenuePayouts from "./components/RevenuePayouts";
import RevenueSummaryCards from "./components/RevenueSummaryCards";
import RevenueTransactionsTable from "./components/RevenueTransactionsTable";

export default async function RevenueOverview() {
	const [summary, transactions, connect] = await Promise.all([
		getRevenueSummary(),
		getRecentTransactions(),
		getConnectStatus(),
	]);

	return (
		<PageShell
			description="Track your earnings, payouts, and transactions."
			title="Revenue"
		>
			<RevenueSummaryCards summary={summary} />
			<RevenuePayouts connect={connect} />
			<RevenueCharts />
			<RevenueTransactionsTable transactions={transactions} />
		</PageShell>
	);
}
