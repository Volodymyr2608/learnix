"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { Input } from "@/app/_components/_shared/ui/input";
import { Label } from "@/app/_components/_shared/ui/label";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import { api } from "@/trpc/client";
import { exceptionResultText } from "./utils";

/** FR-A6: refund any succeeded payment as an exception, with a mandatory reason. */
export const ExceptionRefundForm = () => {
	const router = useRouter();
	const [paymentId, setPaymentId] = useState("");
	const [reason, setReason] = useState("");
	const refund = api.refundAdmin.refundException.useMutation({
		onSuccess: (result) => {
			if (result) toast.success(exceptionResultText(result.status));
			setPaymentId("");
			setReason("");
			router.refresh();
		},
		onError: (error) => toast.error(error.message || "The exception failed."),
	});

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		refund.mutate({ paymentId: paymentId.trim(), reason: reason.trim() });
	};

	return (
		<form className="max-w-xl space-y-3" onSubmit={handleSubmit}>
			<div className="space-y-2">
				<Label htmlFor="exception-payment">Payment id</Label>
				<Input
					id="exception-payment"
					onChange={(event) => setPaymentId(event.target.value)}
					required
					value={paymentId}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="exception-reason">Reason (kept in the audit)</Label>
				<Textarea
					id="exception-reason"
					maxLength={2000}
					onChange={(event) => setReason(event.target.value)}
					required
					value={reason}
				/>
			</div>
			<Button
				disabled={!paymentId.trim() || !reason.trim() || refund.isPending}
				type="submit"
				variant="destructive"
			>
				Refund as an exception
			</Button>
		</form>
	);
};
