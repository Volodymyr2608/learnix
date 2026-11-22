"use client";

import Link from "next/link";
import { Badge } from "@/app/_components/_shared/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/app/_components/_shared/ui/tooltip";
import type { RefundRowActionProps } from "./types";
import {
	REFUND_POLICY_HREF,
	refundPageHref,
	refundStatusLabel,
	refundTooltipText,
} from "./utils";

/** FR-S1, S8–S12: the row's refund action, its status, or nothing — decided on the server. */
export const RefundRowAction = ({
	paymentId,
	refund,
}: RefundRowActionProps) => {
	if (!refund || refund.kind === "none") return null;
	if (refund.kind === "status")
		return <Badge variant="outline">{refundStatusLabel(refund.status)}</Badge>;
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Link
						className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
						href={refundPageHref(paymentId)}
					>
						Request a refund
					</Link>
				</TooltipTrigger>
				<TooltipContent className="space-y-1">
					<p>{refundTooltipText(refund.windowEndsAt)}</p>
					<Link className="underline" href={REFUND_POLICY_HREF}>
						Refund policy
					</Link>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
