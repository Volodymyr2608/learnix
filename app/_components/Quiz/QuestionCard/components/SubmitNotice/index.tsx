import { AlertCircle } from "lucide-react";
import type { SubmitNoticeProps } from "./types";

/**
 * A refused submission used to be invisible: the mutation rejected and the card
 * looked identical to one that had never been clicked. With an attempt cap and a
 * cooldown, that silence would read as a broken button.
 */
export const SubmitNotice = ({ message }: SubmitNoticeProps) => (
	<p
		className="flex items-center gap-1.5 text-destructive text-xs"
		role="alert"
	>
		<AlertCircle className="size-3.5 shrink-0" />
		{message}
	</p>
);
