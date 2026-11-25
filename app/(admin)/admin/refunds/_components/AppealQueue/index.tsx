import { AppealCard } from "../AppealCard";
import type { AppealQueueProps } from "./types";

/** FR-A1: the open appeals, oldest first (the server orders them). */
export const AppealQueue = ({ appeals }: AppealQueueProps) => {
	if (appeals.length === 0)
		return (
			<p className="text-muted-foreground text-sm">No appeals are waiting.</p>
		);
	return (
		<div className="space-y-3">
			{appeals.map((appeal) => (
				<AppealCard appeal={appeal} key={appeal.appealId} />
			))}
		</div>
	);
};
