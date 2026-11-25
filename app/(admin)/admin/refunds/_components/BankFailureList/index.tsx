import { formatAmount, formatUtcDate } from "@/app/_components/Billing/utils";
import { ResolveBankFailureDialog } from "../ResolveBankFailureDialog";
import type { BankFailureListProps } from "./types";

/** FR-P27: refunds that failed at the bank — access restored, share held — until closed. */
export const BankFailureList = ({ items }: BankFailureListProps) => {
	if (items.length === 0)
		return (
			<p className="text-muted-foreground text-sm">
				No refund failed at the bank.
			</p>
		);
	return (
		<ul className="divide-y rounded-lg border">
			{items.map((item) => (
				<li
					className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
					key={item.paymentId}
				>
					<div>
						<p className="font-medium">
							{item.courseTitle} · {item.studentName}
						</p>
						<p className="text-muted-foreground">
							{formatAmount(item.amountCents, item.currency)}
							{item.failedAt && ` · failed ${formatUtcDate(item.failedAt)}`} ·{" "}
							{item.paymentId}
						</p>
					</div>
					<div className="flex gap-2">
						<ResolveBankFailureDialog
							outcome="refunded_elsewhere"
							paymentId={item.paymentId}
						/>
						<ResolveBankFailureDialog
							outcome="sale_stands"
							paymentId={item.paymentId}
						/>
					</div>
				</li>
			))}
		</ul>
	);
};
