"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { api } from "@/trpc/client";
import type { RetryButtonProps } from "./types";
import { retryResultMessage } from "./utils";

/** AC-F11: one Retry; owns its mutation and refreshes the panel when it settles. */
export const RetryButton = ({ kind, targetId }: RetryButtonProps) => {
	const router = useRouter();
	const handlers = {
		onSuccess: (result: { status: string } | { outcome: string }) => {
			const message = retryResultMessage(result);
			if (message.tone === "success") toast.success(message.text);
			else toast.warning(message.text);
			router.refresh();
		},
		onError: (err: { message: string }) => {
			toast.error(err.message || "Retry failed.");
			router.refresh();
		},
	};
	const refund = api.payment.retryRefund.useMutation(handlers);
	const release = api.payment.retryRelease.useMutation(handlers);
	const reversal = api.payment.retryReversal.useMutation(handlers);

	const pending = refund.isPending || release.isPending || reversal.isPending;
	const onClick = () => {
		if (kind === "refund") refund.mutate({ requestId: targetId });
		if (kind === "release") release.mutate({ paymentId: targetId });
		if (kind === "reversal") reversal.mutate({ paymentId: targetId });
	};

	return (
		<Button disabled={pending} onClick={onClick} size="sm" variant="outline">
			Retry
		</Button>
	);
};
