import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import { api } from "@/trpc/client";
import type { ComposerProps } from "./types";

export const Composer = ({ conversationId, onSent }: ComposerProps) => {
	const [draft, setDraft] = useState("");

	const send = api.message.send.useMutation({
		onSuccess: () => {
			setDraft("");
			onSent();
		},
	});

	const submit = () => {
		const body = draft.trim();
		if (!body) return;
		send.mutate({ conversationId, body });
	};

	return (
		<div className="flex items-end gap-2 border-t p-3">
			<Textarea
				className="max-h-32 min-h-10 resize-none"
				maxLength={2000}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						submit();
					}
				}}
				placeholder="Write a message…"
				rows={1}
				value={draft}
			/>
			<Button
				disabled={send.isPending || draft.trim().length === 0}
				onClick={submit}
				size="icon"
				type="button"
			>
				<Send />
				<span className="sr-only">Send message</span>
			</Button>
		</div>
	);
};
