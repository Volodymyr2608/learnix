"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/_components/_shared/ui/dialog";
import { Label } from "@/app/_components/_shared/ui/label";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import { api } from "@/trpc/client";
import type { ResolveBankFailureDialogProps } from "./types";
import { OUTCOME_LABEL, outcomeDescription } from "./utils";

/** FR-P27 (W6): one audited outcome for a refund that failed at the bank; owns its mutation. */
export const ResolveBankFailureDialog = ({
	paymentId,
	outcome,
}: ResolveBankFailureDialogProps) => {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const resolve = api.refundAdmin.resolveBankFailure.useMutation({
		onSuccess: () => {
			toast.success("Closed.");
			setOpen(false);
			router.refresh();
		},
		onError: (error) => toast.error(error.message || "Could not close it."),
	});

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		resolve.mutate({ paymentId, outcome, note: note.trim() });
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					{OUTCOME_LABEL[outcome]}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form className="space-y-4" onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>{OUTCOME_LABEL[outcome]}</DialogTitle>
						<DialogDescription>{outcomeDescription(outcome)}</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor={`bank-${outcome}-${paymentId}`}>
							Note (kept in the audit)
						</Label>
						<Textarea
							id={`bank-${outcome}-${paymentId}`}
							maxLength={2000}
							onChange={(event) => setNote(event.target.value)}
							required
							value={note}
						/>
					</div>
					<DialogFooter>
						<Button disabled={!note.trim() || resolve.isPending} type="submit">
							Confirm
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};
