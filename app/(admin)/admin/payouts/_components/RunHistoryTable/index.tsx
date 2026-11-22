import { Badge } from "@/app/_components/_shared/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/_components/_shared/ui/table";
import { outcomeBadge, utcLabel } from "../PayoutStatusCard/utils";
import type { RunHistoryTableProps } from "./types";

/** FR-A8: the last runs, newest first. */
export const RunHistoryTable = ({ history }: RunHistoryTableProps) => {
	if (history.length === 0) {
		return <p className="text-muted-foreground text-sm">No runs yet.</p>;
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Started</TableHead>
					<TableHead>Trigger</TableHead>
					<TableHead>Outcome</TableHead>
					<TableHead>Released</TableHead>
					<TableHead>Failed</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{history.map((run) => {
					const badge = outcomeBadge(run.outcome);
					return (
						<TableRow key={run.id}>
							<TableCell>{utcLabel(run.startedAt)}</TableCell>
							<TableCell>{run.trigger}</TableCell>
							<TableCell>
								<Badge variant={badge.variant}>{badge.label}</Badge>
							</TableCell>
							<TableCell>
								{run.released}/{run.processed}
							</TableCell>
							<TableCell>{run.failed}</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
};
