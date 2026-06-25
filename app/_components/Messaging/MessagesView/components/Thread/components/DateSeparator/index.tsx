import { dateSeparatorLabel } from "../../utils";
import type { DateSeparatorProps } from "./types";

export const DateSeparator = ({ date }: DateSeparatorProps) => {
	return (
		<div className="my-3 flex items-center gap-3">
			<span className="h-px flex-1 bg-border" />
			<span className="text-[11px] text-muted-foreground">
				{dateSeparatorLabel(date)}
			</span>
			<span className="h-px flex-1 bg-border" />
		</div>
	);
};
