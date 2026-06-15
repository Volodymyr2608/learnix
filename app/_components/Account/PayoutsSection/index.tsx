"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { EarningsTable } from "@/app/_components/Account/PayoutsSection/components/EarningsTable";
import { PayoutsActionButton } from "@/app/_components/Account/PayoutsSection/components/PayoutsActionButton";
import { StatusBadge } from "@/app/_components/Account/PayoutsSection/components/StatusBadge";
import { api } from "@/trpc/client";

const PayoutsSection = () => {
	const { data: connectData, isLoading: connectLoading } =
		api.payment.getConnectStatus.useQuery();

	const { data: earningsData, isLoading: earningsLoading } =
		api.payment.getInstructorEarnings.useQuery();

	const status = connectData?.status;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Payouts &amp; verification</CardTitle>
				<CardDescription>
					Set up your Stripe account to receive payouts from course sales.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{connectLoading && (
					<p className="text-muted-foreground text-sm">Loading…</p>
				)}

				{!connectLoading && status !== undefined && (
					<>
						<div className="flex items-center gap-3">
							<span className="text-sm">Verification status:</span>
							<StatusBadge status={status} />
						</div>
						<PayoutsActionButton status={status} />
					</>
				)}

				{earningsLoading && (
					<p className="text-muted-foreground text-sm">Loading earnings…</p>
				)}
				{!earningsLoading && earningsData && (
					<EarningsTable earnings={earningsData} />
				)}
			</CardContent>
		</Card>
	);
};

export default PayoutsSection;
