import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { formatPrice } from "@/lib/formatPrice";
import type { HeldFundsCardProps } from "./types";

/** FR-A8 / M9: instructor money held on the platform, and what is due within 7 days. */
export const HeldFundsCard = ({ heldFunds }: HeldFundsCardProps) => (
	<Card>
		<CardHeader>
			<CardTitle className="font-medium text-sm">Held funds</CardTitle>
		</CardHeader>
		<CardContent className="space-y-1">
			<div className="font-bold text-2xl">
				{formatPrice(heldFunds.totalCents)}
			</div>
			<p className="text-muted-foreground text-xs">
				{heldFunds.count} sale(s) held · {formatPrice(heldFunds.dueSoonCents)}{" "}
				due within 7 days
			</p>
		</CardContent>
	</Card>
);
