"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { api } from "@/trpc/client";

export function SweepButton() {
	const sweep = api.payment.sweepAllPendingTransfers.useMutation({
		onSuccess: ({ instructorsSwept }) => {
			toast.success(
				instructorsSwept > 0
					? `Swept pending transfers for ${instructorsSwept} instructor(s).`
					: "No pending transfers found.",
			);
		},
		onError: (err) => {
			toast.error(err.message || "Sweep failed. Check server logs.");
		},
	});

	return (
		<Button
			disabled={sweep.isPending}
			onClick={() => sweep.mutate()}
			variant="outline"
		>
			{sweep.isPending ? (
				<Loader2 className="animate-spin" />
			) : (
				<RefreshCw className="h-4 w-4" />
			)}
			Sweep pending instructor transfers
		</Button>
	);
}
