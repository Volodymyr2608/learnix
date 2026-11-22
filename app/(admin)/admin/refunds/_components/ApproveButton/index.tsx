"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { api } from "@/trpc/client";
import type { ApproveButtonProps } from "./types";

/** FR-A2: approve an appeal; disabled, with the reason, while a certificate or dispute exists. */
export const ApproveButton = ({
	appealId,
	blockedReason,
}: ApproveButtonProps) => {
	const router = useRouter();
	const approve = api.refundAdmin.approveAppeal.useMutation({
		onSuccess: () => {
			toast.success("Appeal approved; the refund is on its way.");
			router.refresh();
		},
		onError: (error) => {
			toast.error(error.message || "Could not approve the appeal.");
			router.refresh();
		},
	});
	return (
		<div className="space-y-1">
			<Button
				disabled={Boolean(blockedReason) || approve.isPending}
				onClick={() => approve.mutate({ appealId })}
				size="sm"
			>
				Approve
			</Button>
			{blockedReason && (
				<p className="text-muted-foreground text-xs">{blockedReason}</p>
			)}
		</div>
	);
};
