import { AlertTriangle } from "lucide-react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { RunPayoutJobButton } from "@/app/(admin)/admin/_components/RunPayoutJobButton";
import type { PayoutStatusCardProps } from "./types";
import { outcomeBadge, staleMessage, utcLabel } from "./utils";

/** FR-A8: the job's last run and outcome, with the 48 h warning and "Run job now". */
export const PayoutStatusCard = ({
	lastRun,
	lastSuccessAt,
	stale,
}: PayoutStatusCardProps) => {
	const badge = lastRun ? outcomeBadge(lastRun.outcome) : null;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-medium text-sm">Payout job</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{stale && (
					<p className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
						{staleMessage(lastSuccessAt)}
					</p>
				)}
				{!lastRun && (
					<p className="text-muted-foreground text-sm">No run yet.</p>
				)}
				{lastRun && badge && (
					<div className="space-y-1 text-sm">
						<div className="flex items-center gap-2">
							<Badge variant={badge.variant}>{badge.label}</Badge>
							<span className="text-muted-foreground">
								{lastRun.trigger} · {utcLabel(lastRun.startedAt)}
							</span>
						</div>
						<p>
							Released {lastRun.released} of {lastRun.processed}
							{lastRun.failed > 0 && `, ${lastRun.failed} failed`}
						</p>
						{lastRun.error && (
							<p className="font-mono text-destructive text-xs">
								{lastRun.error}
							</p>
						)}
					</div>
				)}
				<RunPayoutJobButton />
			</CardContent>
		</Card>
	);
};
