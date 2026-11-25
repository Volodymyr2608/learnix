import { ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import type { RefundRowActionProps } from "./types";
import {
	REFUND_POLICY_HREF,
	refundDeadlineText,
	refundPageHref,
	refundStatusLabel,
} from "./utils";

const STRIP_CLASS =
	"flex flex-col gap-3 border-border/60 border-t bg-muted/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-between";

/**
 * FR-S1, S8–S12: the purchase's refund strip under the row — the action with its deadline and the
 * policy, or the request's status with a link to its details, or nothing. Decided on the server. The
 * deadline and the policy link are visible text, not a tooltip, so keyboard and touch users reach
 * them too (review I3).
 */
export const RefundRowAction = ({
	paymentId,
	refund,
}: RefundRowActionProps) => {
	if (!refund || refund.kind === "none") return null;
	if (refund.kind === "status")
		return (
			<div className={STRIP_CLASS}>
				<span className="flex items-center gap-2 font-medium text-sm">
					<RotateCcw className="h-4 w-4 shrink-0 text-muted-foreground" />
					{refundStatusLabel(refund.status)}
				</span>
				<Link
					className="flex items-center gap-1 text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
					href={refundPageHref(paymentId)}
				>
					View details
					<ChevronRight className="h-4 w-4" />
				</Link>
			</div>
		);
	return (
		<div className={STRIP_CLASS}>
			<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm">
				<RotateCcw className="h-4 w-4 shrink-0" />
				{refundDeadlineText(refund.windowEndsAt)}
				<span aria-hidden="true">·</span>
				<Link
					className="underline underline-offset-2 hover:text-foreground"
					href={REFUND_POLICY_HREF}
				>
					Refund policy
				</Link>
			</span>
			{/* An outline button: visible, yet quieter than the page's primary actions. */}
			<Button
				asChild
				className="self-start sm:self-auto"
				size="sm"
				variant="outline"
			>
				<Link href={refundPageHref(paymentId)}>Request a refund</Link>
			</Button>
		</div>
	);
};
