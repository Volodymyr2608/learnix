"use client";

import { MessagesSquare } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { api } from "@/trpc/client";
import { Inbox } from "./components/Inbox";
import { Thread } from "./components/Thread";
import type { MessagesViewProps } from "./types";

export default function MessagesView({ basePath }: MessagesViewProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const activeId = searchParams.get("c");

	const conversations = api.message.listConversations.useQuery(undefined, {
		refetchInterval: 15_000,
	});

	const select = (conversationId: string) => {
		router.replace(`${basePath}?c=${conversationId}`);
	};

	const clearSelection = () => {
		router.replace(basePath);
	};

	return (
		<div className="grid h-[calc(100vh-8rem)] grid-cols-1 overflow-hidden rounded-xl border bg-card shadow-sm md:grid-cols-[340px_1fr]">
			<div
				className={cn(
					"min-h-0 flex-col md:flex md:border-r",
					activeId ? "hidden md:flex" : "flex",
				)}
			>
				<Inbox
					activeId={activeId}
					conversations={conversations.data ?? []}
					isLoading={conversations.isLoading}
					onSelect={select}
				/>
			</div>
			<div
				className={cn(
					"min-h-0 flex-col md:flex",
					activeId ? "flex" : "hidden md:flex",
				)}
			>
				{!activeId && <EmptyThread />}
				{activeId && (
					<Thread conversationId={activeId} onBack={clearSelection} />
				)}
			</div>
		</div>
	);
}

function EmptyThread() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
			<div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<MessagesSquare className="size-6" />
			</div>
			<div className="space-y-1">
				<p className="font-medium text-sm">No conversation selected</p>
				<p className="text-muted-foreground text-sm">
					Pick a conversation from the list to read and reply.
				</p>
			</div>
		</div>
	);
}
