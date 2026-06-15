"use client";

import type { EarningsTableProps } from "@/app/_components/Account/PayoutsSection/types";
import { formatPrice } from "@/lib/formatPrice";

export function EarningsTable({ earnings }: EarningsTableProps) {
	return (
		<div className="mt-2 rounded-md border">
			<dl className="divide-y text-sm">
				<div className="flex justify-between px-4 py-2.5">
					<dt className="text-muted-foreground">Available / transferred</dt>
					<dd className="font-medium">
						{formatPrice(earnings.availableCents)}
					</dd>
				</div>
				<div className="flex justify-between px-4 py-2.5">
					<dt className="text-muted-foreground">Pending (owed)</dt>
					<dd className="font-medium">{formatPrice(earnings.owedCents)}</dd>
				</div>
				<div className="flex justify-between px-4 py-2.5">
					<dt className="text-muted-foreground">Lifetime gross</dt>
					<dd className="font-medium">
						{formatPrice(earnings.lifetimeGrossCents)}
					</dd>
				</div>
				<div className="flex justify-between px-4 py-2.5">
					<dt className="text-muted-foreground">Platform fees paid</dt>
					<dd className="font-medium">
						{formatPrice(earnings.platformFeesCents)}
					</dd>
				</div>
			</dl>
		</div>
	);
}
