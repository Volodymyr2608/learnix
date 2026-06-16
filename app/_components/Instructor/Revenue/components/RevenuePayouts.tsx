"use client";

import { Card } from "@/app/_components/_shared/ui/card";
import { PayoutsActionButton } from "@/app/_components/Account/PayoutsSection/components/PayoutsActionButton";
import { formatUsd } from "@/lib/formatUsd";
import { api } from "@/trpc/client";
import type { RevenuePayoutsProps } from "../types";

export default function RevenuePayouts({
	paidOutCents,
	pendingCents,
}: RevenuePayoutsProps) {
	const { data: connect } = api.payment.getConnectStatus.useQuery();

	return (
		<Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex gap-10">
				<div>
					<p className="text-muted-foreground text-sm">Paid out</p>
					<p className="mt-1 font-bold text-2xl text-green-600">
						{formatUsd(paidOutCents)}
					</p>
				</div>
				<div>
					<p className="text-muted-foreground text-sm">Pending payout</p>
					<p className="mt-1 font-bold text-2xl">{formatUsd(pendingCents)}</p>
				</div>
			</div>
			<div className="flex flex-col items-start gap-2 sm:items-end">
				<p className="text-muted-foreground text-sm">
					Payouts are sent automatically to your connected account.
				</p>
				{connect?.status !== undefined && (
					<PayoutsActionButton status={connect.status} />
				)}
			</div>
		</Card>
	);
}
