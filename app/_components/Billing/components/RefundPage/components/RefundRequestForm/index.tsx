"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { Label } from "@/app/_components/_shared/ui/label";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import { formatUtcDate } from "@/app/_components/Billing/utils";
import type { RefundReason } from "@/generated/prisma";
import { api } from "@/trpc/client";
import { REFUND_CONSEQUENCES, refundAmountText } from "../../utils";
import type { RefundRequestFormProps } from "./types";
import { MAX_REFUND_TEXT, REASON_OPTIONS } from "./utils";

/**
 * FR-S3, S4 (U8): a closed-list reason and optional text; the amount and the consequences before
 * submit. The form owns the mutation; afterwards the page re-reads the server's state.
 */
export const RefundRequestForm = ({
	paymentId,
	amountCents,
	currency,
	windowEndsAt,
}: RefundRequestFormProps) => {
	const router = useRouter();
	const [reason, setReason] = useState<RefundReason | null>(null);
	const [text, setText] = useState("");

	const request = api.refund.request.useMutation({
		onSuccess: () => router.refresh(),
		onError: (error) => {
			if (error.data?.code === "CONFLICT") {
				router.refresh();
				return;
			}
			toast.error(error.message || "The request failed. Please try again.");
		},
	});

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		if (!reason) return;
		request.mutate({
			paymentId,
			reason,
			text: text.trim() ? text.trim() : undefined,
		});
	};

	return (
		<form className="space-y-6" onSubmit={handleSubmit}>
			<fieldset className="space-y-2">
				<legend className="font-medium text-sm">
					Why are you asking for a refund?
				</legend>
				{REASON_OPTIONS.map((option) => (
					<label className="flex items-center gap-2 text-sm" key={option.value}>
						<input
							checked={reason === option.value}
							name="reason"
							onChange={() => setReason(option.value)}
							type="radio"
							value={option.value}
						/>
						{option.label}
					</label>
				))}
			</fieldset>

			<div className="space-y-2">
				<Label htmlFor="refund-text">Anything else? (optional)</Label>
				<Textarea
					id="refund-text"
					maxLength={MAX_REFUND_TEXT}
					onChange={(event) => setText(event.target.value)}
					value={text}
				/>
			</div>

			<div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
				<p className="font-medium">{refundAmountText(amountCents, currency)}</p>
				<ul className="list-disc space-y-1 pl-6">
					{REFUND_CONSEQUENCES.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
				<p className="text-muted-foreground">
					You can request a refund until {formatUtcDate(windowEndsAt)} (UTC).
				</p>
			</div>

			<Button disabled={!reason || request.isPending} type="submit">
				{request.isPending ? "Requesting…" : "Request refund"}
			</Button>
		</form>
	);
};
