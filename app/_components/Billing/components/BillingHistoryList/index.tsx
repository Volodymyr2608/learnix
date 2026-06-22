import { CalendarDays, Download, RotateCcw, User } from "lucide-react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card, CardContent } from "@/app/_components/_shared/ui/card";
import type {
	BillingHistoryListProps,
	PurchaseRowProps,
	StatusBadgeProps,
} from "@/app/_components/Billing/components/BillingHistoryList/types";

function formatAmount(amountCents: number, currency: string): string {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountCents / 100);
}

function formatDate(date: Date): string {
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function StatusBadge({ status }: StatusBadgeProps) {
	if (status === "refunded") {
		return (
			<Badge
				className="border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
				variant="outline"
			>
				Refunded
			</Badge>
		);
	}
	return (
		<Badge
			className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
			variant="outline"
		>
			Paid
		</Badge>
	);
}

function PurchaseRow({ item }: PurchaseRowProps) {
	return (
		<Card className="overflow-hidden">
			<CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0 space-y-1">
					<div className="flex items-center gap-3">
						<h3 className="truncate font-semibold text-base">
							{item.courseTitle}
						</h3>
						<StatusBadge status={item.status} />
					</div>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
						<span className="flex items-center gap-1.5">
							<User className="h-3.5 w-3.5 shrink-0" />
							{item.instructorName}
						</span>
						<span className="flex items-center gap-1.5">
							<CalendarDays className="h-3.5 w-3.5 shrink-0" />
							{formatDate(item.purchasedAt)}
						</span>
						{item.status === "refunded" && item.refundedAt && (
							<span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
								<RotateCcw className="h-3.5 w-3.5 shrink-0" />
								Refunded {formatDate(item.refundedAt)}
							</span>
						)}
					</div>
				</div>
				<div className="flex items-center gap-4 sm:flex-col sm:items-end">
					<span className="font-semibold text-lg">
						{formatAmount(item.amountCents, item.currency)}
					</span>
					<Button asChild size="sm" variant="outline">
						<a download href={item.invoiceUrl}>
							<Download className="h-4 w-4" />
							Invoice
						</a>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

const BillingHistoryList = ({ items }: BillingHistoryListProps) => {
	return (
		<div className="space-y-3">
			{items.map((item) => (
				<PurchaseRow item={item} key={item.paymentId} />
			))}
		</div>
	);
};

export default BillingHistoryList;
