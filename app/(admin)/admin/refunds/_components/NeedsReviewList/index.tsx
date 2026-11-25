import { formatAmount, formatUtcDate } from "@/app/_components/Billing/utils";
import { MarkReviewedButton } from "../MarkReviewedButton";
import type { NeedsReviewListProps } from "./types";

/** FR-A7: payments refunded in the Stripe Dashboard, waiting for an admin to look at them. */
export const NeedsReviewList = ({ items }: NeedsReviewListProps) => {
	if (items.length === 0)
		return (
			<p className="text-muted-foreground text-sm">Nothing needs review.</p>
		);
	return (
		<ul className="divide-y rounded-lg border">
			{items.map((item) => (
				<li
					className="flex items-center justify-between gap-4 p-3 text-sm"
					key={item.paymentId}
				>
					<div>
						<p className="font-medium">
							{item.courseTitle} · {item.studentName}
						</p>
						<p className="text-muted-foreground">
							{formatAmount(item.amountCents, item.currency)} ·{" "}
							{item.fullyRefunded ? "refunded in full" : "partly refunded"}
							{item.flaggedAt && ` · flagged ${formatUtcDate(item.flaggedAt)}`}{" "}
							· {item.paymentId}
						</p>
					</div>
					<MarkReviewedButton paymentId={item.paymentId} />
				</li>
			))}
		</ul>
	);
};
