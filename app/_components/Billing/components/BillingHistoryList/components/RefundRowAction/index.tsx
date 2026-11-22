import Link from "next/link";
import type { RefundRowActionProps } from "./types";
import {
	REFUND_POLICY_HREF,
	refundDeadlineText,
	refundPageHref,
	refundStatusLabel,
} from "./utils";

const LINK_CLASS =
	"text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline";

/**
 * FR-S1, S8–S12: the row's refund action, or its status as a link to the details, or nothing —
 * decided on the server. The deadline and the policy link are visible text, not a tooltip, so
 * keyboard and touch users reach them too (review I3).
 */
export const RefundRowAction = ({
	paymentId,
	refund,
}: RefundRowActionProps) => {
	if (!refund || refund.kind === "none") return null;
	if (refund.kind === "status")
		return (
			<Link className={LINK_CLASS} href={refundPageHref(paymentId)}>
				{refundStatusLabel(refund.status)}
			</Link>
		);
	return (
		<div className="flex flex-col items-end gap-0.5">
			<Link className={LINK_CLASS} href={refundPageHref(paymentId)}>
				Request a refund
			</Link>
			<span className="text-muted-foreground text-xs">
				{refundDeadlineText(refund.windowEndsAt)} ·{" "}
				<Link
					className="underline underline-offset-2"
					href={REFUND_POLICY_HREF}
				>
					Refund policy
				</Link>
			</span>
		</div>
	);
};
