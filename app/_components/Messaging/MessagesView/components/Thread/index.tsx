import { useEffect, useRef } from "react";
import { api } from "@/trpc/client";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { ThreadHeader } from "./components/ThreadHeader";
import { ThreadSkeleton } from "./components/ThreadSkeleton";
import type { ThreadProps } from "./types";

export const Thread = ({ conversationId, onBack }: ThreadProps) => {
	const utils = api.useUtils();
	const bottomRef = useRef<HTMLDivElement>(null);

	const thread = api.message.getThread.useQuery(
		{ conversationId },
		{ refetchInterval: 10_000 },
	);

	const markRead = api.message.markRead.useMutation({
		onSuccess: () => utils.message.listConversations.invalidate(),
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

	const handleSent = () => {
		thread.refetch();
		utils.message.listConversations.invalidate();
	};

	return (
		<div className="flex h-full flex-col">
			<ThreadHeader
				courseTitle={thread.data?.courseTitle ?? ""}
				isLoading={thread.isLoading}
				name={thread.data?.otherParticipantName ?? ""}
				onBack={onBack}
			/>

			<div className="flex-1 overflow-y-auto px-4 py-4">
				{thread.isLoading && <ThreadSkeleton />}
				{!thread.isLoading && thread.data && (
					<MessageList
						messages={thread.data.messages}
						otherParticipantName={thread.data.otherParticipantName}
					/>
				)}
				<div ref={bottomRef} />
			</div>

			<Composer conversationId={conversationId} onSent={handleSent} />
		</div>
	);
};
