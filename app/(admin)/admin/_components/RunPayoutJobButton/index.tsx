"use client";

import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { api } from "@/trpc/client";
import { runSummaryMessage } from "./utils";

/** "Run job now" (ADR-037 §3.7): the daily payout job, on demand, under the same lock. */
export const RunPayoutJobButton = () => {
	const run = api.payment.runPayoutJobNow.useMutation({
		onSuccess: (summary) => {
			toast.success(runSummaryMessage(summary));
		},
		onError: (err) => {
			toast.error(
				err.message || "The payout job failed. Check the run history.",
			);
		},
	});

	return (
		<Button
			disabled={run.isPending}
			onClick={() => run.mutate()}
			variant="outline"
		>
			{run.isPending ? (
				<Loader2 className="animate-spin" />
			) : (
				<Play className="h-4 w-4" />
			)}
			Run job now
		</Button>
	);
};
