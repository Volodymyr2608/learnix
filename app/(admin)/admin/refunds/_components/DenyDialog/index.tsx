"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/_components/_shared/ui/dialog";
import { Label } from "@/app/_components/_shared/ui/label";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import {
	APPEAL_ACCEPT,
	appealErrorMessage,
	MAX_APPEAL_FILES,
} from "@/app/_components/Billing/components/RefundPage/components/AppealForm/utils";
import type { DenyDialogProps } from "./types";

/** FR-A2: deny with a written reason and 0–3 files — final, shown to the student. */
export const DenyDialog = ({ appealId }: DenyDialogProps) => {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [sending, setSending] = useState(false);

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!reason.trim()) return;
		const body = new FormData();
		body.set("reason", reason.trim());
		for (const file of files) body.append("files", file);
		setSending(true);
		const res = await fetch(`/api/admin/refunds/appeals/${appealId}/deny`, {
			method: "POST",
			body,
		});
		setSending(false);
		if (res.ok) {
			toast.success("Appeal denied.");
			setOpen(false);
			router.refresh();
			return;
		}
		const json = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		toast.error(appealErrorMessage(res.status, json?.error));
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					Deny
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form className="space-y-4" onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Deny the appeal</DialogTitle>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor={`deny-${appealId}`}>
							Reason (shown to the student)
						</Label>
						<Textarea
							id={`deny-${appealId}`}
							maxLength={2000}
							onChange={(event) => setReason(event.target.value)}
							required
							value={reason}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor={`deny-files-${appealId}`}>
							Files (optional, up to {MAX_APPEAL_FILES})
						</Label>
						<input
							accept={APPEAL_ACCEPT}
							className="text-sm"
							id={`deny-files-${appealId}`}
							multiple
							onChange={(event) =>
								setFiles(
									Array.from(event.target.files ?? []).slice(
										0,
										MAX_APPEAL_FILES,
									),
								)
							}
							type="file"
						/>
					</div>
					<DialogFooter>
						<Button
							disabled={!reason.trim() || sending}
							type="submit"
							variant="destructive"
						>
							{sending ? "Denying…" : "Deny appeal"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};
