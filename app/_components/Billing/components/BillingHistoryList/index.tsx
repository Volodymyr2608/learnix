import {
	BookOpen,
	CalendarDays,
	CheckCircle2,
	Download,
	RotateCcw,
	User,
} from "lucide-react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card, CardContent } from "@/app/_components/_shared/ui/card";
import type {
	BillingHistoryListProps,
	PurchaseRowProps,
	StatusBadgeProps,
} from "@/app/_components/Billing/components/BillingHistoryList/types";
import { cn } from "@/lib/utils/cn";

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
				className="gap-1 border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
				variant="outline"
			>
				<RotateCcw className="h-3 w-3" />
				Refunded
			</Badge>
		);
	}
	return (
		<Badge
			className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
			variant="outline"
		>
			<CheckCircle2 className="h-3 w-3" />
			Paid
		</Badge>
	);
}

function PurchaseRow({ item }: PurchaseRowProps) {
	const isRefunded = item.status === "refunded";

	return (
		<Card className="group overflow-hidden py-0 transition-all hover:border-primary/20 hover:shadow-md">
			<CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm ring-4 ring-indigo-500/10">
					<BookOpen className="h-6 w-6" />
				</div>

				<div className="min-w-0 flex-1 space-y-1.5">
					<div className="flex items-center gap-2.5">
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
						{isRefunded && item.refundedAt && (
							<span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
								<RotateCcw className="h-3.5 w-3.5 shrink-0" />
								Refunded {formatDate(item.refundedAt)}
							</span>
						)}
					</div>
				</div>

				<div className="flex items-center justify-between gap-4 border-border/60 border-t pt-4 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
					<span
						className={cn(
							"font-semibold text-lg tabular-nums",
							isRefunded && "text-muted-foreground line-through",
						)}
					>
						{formatAmount(item.amountCents, item.currency)}
					</span>
					<Button asChild className="gap-1.5" size="sm" variant="outline">
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
