import { Info } from "lucide-react";
import type { RefundUnavailableProps } from "./types";

/** FR-S8–S11: why this purchase cannot be refunded. */
export const RefundUnavailable = ({ message }: RefundUnavailableProps) => (
	<div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
		<Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
		<p>{message}</p>
	</div>
);
