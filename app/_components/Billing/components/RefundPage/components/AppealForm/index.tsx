"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { Label } from "@/app/_components/_shared/ui/label";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import type { RefundReason } from "@/generated/prisma";
import { MAX_REFUND_TEXT, REASON_OPTIONS } from "../RefundRequestForm/utils";
import type { AppealFormProps } from "./types";
import { APPEAL_ACCEPT, appealErrorMessage, MAX_APPEAL_FILES } from "./utils";

/**
 * FR-S13–S15 (V8, V17): the appeal — a closed-list reason, mandatory text and 0–3 files, sent as
 * one multipart request. The form owns the request; afterwards the page re-reads the server state.
 */
export const AppealForm = ({ paymentId, openLabel }: AppealFormProps) => {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState<RefundReason | null>(null);
	const [text, setText] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [sending, setSending] = useState(false);

	if (!open)
		return (
			<Button onClick={() => setOpen(true)} type="button" variant="outline">
				{openLabel}
			</Button>
		);

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!reason || !text.trim()) return;
		const body = new FormData();
		body.set("paymentId", paymentId);
		body.set("reason", reason);
		body.set("text", text.trim());
		for (const file of files) body.append("files", file);
		setSending(true);
		const res = await fetch("/api/refunds/appeals", { method: "POST", body });
		setSending(false);
		if (res.ok) {
			router.refresh();
			return;
		}
		const json = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		toast.error(appealErrorMessage(res.status, json?.error));
	};

	return (
		<form className="space-y-5" onSubmit={handleSubmit}>
			<fieldset className="space-y-2">
				<legend className="font-medium text-sm">
					Why should an admin refund this purchase?
				</legend>
				{REASON_OPTIONS.map((option) => (
					<label className="flex items-center gap-2 text-sm" key={option.value}>
						<input
							checked={reason === option.value}
							name="appeal-reason"
							onChange={() => setReason(option.value)}
							type="radio"
							value={option.value}
						/>
						{option.label}
					</label>
				))}
			</fieldset>

			<div className="space-y-2">
				<Label htmlFor="appeal-text">Explain what happened</Label>
				<Textarea
					id="appeal-text"
					maxLength={MAX_REFUND_TEXT}
					onChange={(event) => setText(event.target.value)}
					required
					value={text}
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="appeal-files">
					Evidence (optional, up to {MAX_APPEAL_FILES} PNG, JPEG or PDF files, 4
					MB in total)
				</Label>
				<input
					accept={APPEAL_ACCEPT}
					className="text-sm"
					id="appeal-files"
					multiple
					onChange={(event) =>
						setFiles(
							Array.from(event.target.files ?? []).slice(0, MAX_APPEAL_FILES),
						)
					}
					type="file"
				/>
			</div>

			<Button disabled={!reason || !text.trim() || sending} type="submit">
				{sending ? "Sending…" : "Send to an admin"}
			</Button>
		</form>
	);
};
