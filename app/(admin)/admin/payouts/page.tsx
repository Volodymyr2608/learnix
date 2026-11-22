import { api } from "@/trpc/server";
import { HeldFundsCard } from "./_components/HeldFundsCard";
import { PayoutStatusCard } from "./_components/PayoutStatusCard";
import { ProblemPaymentsTable } from "./_components/ProblemPaymentsTable";
import { RunHistoryTable } from "./_components/RunHistoryTable";

/** FR-A8 / AC-F11: the admin Payouts panel. The (admin) layout already requires ADMIN. */
const PayoutsPage = async () => {
	const status = await api.payment.getPayoutStatus();
	const now = new Date();
	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-3xl">Payouts</h1>
				<p className="text-muted-foreground">
					Instructor payouts held for the refund window and released daily.
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<PayoutStatusCard
					lastRun={status.lastRun}
					lastSuccessAt={status.lastSuccessAt}
					stale={status.stale}
				/>
				<HeldFundsCard heldFunds={status.heldFunds} />
			</div>
			<section className="space-y-3">
				<h2 className="font-semibold text-lg">Problem payments</h2>
				<ProblemPaymentsTable now={now} problems={status.problems} />
			</section>
			<section className="space-y-3">
				<h2 className="font-semibold text-lg">Run history</h2>
				<RunHistoryTable history={status.history} />
			</section>
		</div>
	);
};

export default PayoutsPage;
