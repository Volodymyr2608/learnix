"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { api } from "@/trpc/client";
import type { MarkReviewedButtonProps } from "./types";

/** FR-A7: clears the "needs review" flag of one Dashboard refund. */
export const MarkReviewedButton = ({ paymentId }: MarkReviewedButtonProps) => {
	const router = useRouter();
	const mark = api.refundAdmin.markReviewed.useMutation({
		onSuccess: () => router.refresh(),
		onError: (error) => toast.error(error.message || "Could not update."),
	});
	return (
		<Button
			disabled={mark.isPending}
			onClick={() => mark.mutate({ paymentId })}
			size="sm"
			variant="outline"
		>
			Mark reviewed
		</Button>
	);
};
