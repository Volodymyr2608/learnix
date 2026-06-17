import { Wallet } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import { PayoutsActionButton } from "@/app/_components/Account/PayoutsSection/components/PayoutsActionButton";
import { StatusBadge } from "@/app/_components/Account/PayoutsSection/components/StatusBadge";
import { STATUS_HINT } from "./constants/statusHint";
import type { RevenuePayoutsProps } from "./types";

export default function RevenuePayouts({ connect }: RevenuePayoutsProps) {
	const hint = STATUS_HINT[connect.status];

	return (
		<Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-start gap-4">
				<div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-500/10">
					<Wallet className="h-5 w-5 text-green-600" />
				</div>
				<div>
					<div className="flex items-center gap-2">
						<h2 className="font-semibold text-lg">Payouts</h2>
						<StatusBadge status={connect.status} />
					</div>
					<p className="mt-1 max-w-md text-muted-foreground text-sm">{hint}</p>
				</div>
			</div>
			<PayoutsActionButton status={connect.status} />
		</Card>
	);
}
