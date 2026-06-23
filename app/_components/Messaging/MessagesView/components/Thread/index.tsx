"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { api } from "@/trpc/client";
import type { ThreadProps } from "./types";

export function Thread({ conversationId }: ThreadProps) {
	const [draft, setDraft] = useState("");
	const utils = api.useUtils();
	const bottomRef = useRef<HTMLDivElement>(null);

	const thread = api.message.getThread.useQuery(
		{ conversationId },
		{ refetchInterval: 10_000 },
	);

	const markRead = api.message.markRead.useMutation({
		onSuccess: () => utils.message.listConversations.invalidate(),
	});

	const send = api.message.send.useMutation({
		onSuccess: () => {
			setDraft("");
			thread.refetch();
			utils.message.listConversations.invalidate();
		},
	});

	// Mark the thread read whenever it is opened or new messages arrive.
	// biome-ignore lint/correctness/useExhaustiveDependencies: run on id + message count
	useEffect(() => {
		markRead.mutate({ conversationId });
	}, [conversationId, thread.data?.messages.length]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [thread.data?.messages.length]);

	function submit() {
		const body = draft.trim();
		if (!body) return;
		send.mutate({ conversationId, body });
	}

	return (
		<div className="flex h-full flex-col">
			<div className="border-b px-4 py-3">
				<p className="font-medium text-sm">
					{thread.data?.otherParticipantName ?? "…"}
				</p>
				<p className="text-muted-foreground text-xs">
					{thread.data?.courseTitle ?? ""}
				</p>
			</div>

			<div className="flex-1 space-y-2 overflow-y-auto p-4">
				{thread.isLoading && (
					<p className="text-muted-foreground text-sm">Loading messages…</p>
				)}
				{thread.data?.messages.map((m) => (
					<div
						className={cn(
							"max-w-[75%] rounded-lg px-3 py-2 text-sm",
							m.isMine
								? "ml-auto bg-primary text-primary-foreground"
								: "bg-muted",
						)}
						key={m.id}
					>
						{m.body}
					</div>
				))}
				<div ref={bottomRef} />
			</div>

			<div className="flex gap-2 border-t p-3">
				<input
					className="flex-1 rounded-md border px-3 py-2 text-sm"
					maxLength={2000}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							submit();
						}
					}}
					placeholder="Write a message…"
					value={draft}
				/>
				<button
					className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm disabled:opacity-50"
					disabled={send.isPending || draft.trim().length === 0}
					onClick={submit}
					type="button"
				>
					Send
				</button>
			</div>
		</div>
	);
}
