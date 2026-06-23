"use client";

import { useRouter, useSearchParams } from "next/navigation";
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

	function select(conversationId: string) {
		router.replace(`${basePath}?c=${conversationId}`);
	}

	return (
		<div className="grid h-[calc(100vh-8rem)] grid-cols-[320px_1fr] overflow-hidden rounded-lg border">
			<div className="border-r">
				<Inbox
					activeId={activeId}
					conversations={conversations.data ?? []}
					isLoading={conversations.isLoading}
					onSelect={select}
				/>
			</div>
			<div>
				{!activeId && (
					<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
						Select a conversation
					</div>
				)}
				{activeId && <Thread conversationId={activeId} />}
			</div>
		</div>
	);
}
