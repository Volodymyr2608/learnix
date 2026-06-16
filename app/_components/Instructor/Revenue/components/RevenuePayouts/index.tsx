"use client";

import { Wallet } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import { PayoutsActionButton } from "@/app/_components/Account/PayoutsSection/components/PayoutsActionButton";
import { StatusBadge } from "@/app/_components/Account/PayoutsSection/components/StatusBadge";
import { api } from "@/trpc/client";
import { STATUS_HINT } from "./constants/statusHint";

export default function RevenuePayouts() {
	const { data: connect } = api.payment.getConnectStatus.useQuery();
	const hint = connect?.status
		? STATUS_HINT[connect.status]
		: STATUS_HINT.verified;

	return (
		<Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-start gap-4">
				<div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-500/10">
					<Wallet className="h-5 w-5 text-green-600" />
				</div>
				<div>
					<div className="flex items-center gap-2">
						<h2 className="font-semibold text-lg">Payouts</h2>
						{connect?.status !== undefined && (
							<StatusBadge status={connect.status} />
						)}
					</div>
					<p className="mt-1 max-w-md text-muted-foreground text-sm">{hint}</p>
				</div>
			</div>
			{connect?.status !== undefined && (
				<PayoutsActionButton status={connect.status} />
			)}
		</Card>
	);
}
