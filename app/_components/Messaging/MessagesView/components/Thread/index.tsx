import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { ArrowLeft, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import { Skeleton } from "@/app/_components/_shared/ui/skeleton";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { api } from "@/trpc/client";
import { getAvatarColorClass, getInitials } from "../../utils";
import type {
	ComposerProps,
	MessageBubbleProps,
	MessageListProps,
	ThreadHeaderProps,
	ThreadProps,
} from "./types";

export function Thread({ conversationId, onBack }: ThreadProps) {
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

	function handleSent() {
		thread.refetch();
		utils.message.listConversations.invalidate();
	}

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
}

function ThreadHeader({
	name,
	courseTitle,
	isLoading,
	onBack,
}: ThreadHeaderProps) {
	return (
		<div className="flex items-center gap-3 border-b px-4 py-3">
			<Button
				className="md:hidden"
				onClick={onBack}
				size="icon-sm"
				variant="ghost"
			>
				<ArrowLeft />
				<span className="sr-only">Back to conversations</span>
			</Button>
			{isLoading && (
				<>
					<Skeleton className="size-9 shrink-0 rounded-full" />
					<div className="flex flex-col gap-1.5">
						<Skeleton className="h-3.5 w-32" />
						<Skeleton className="h-3 w-24" />
					</div>
				</>
			)}

			{!isLoading && (
				<>
					<span
						className={cn(
							"flex size-9 shrink-0 items-center justify-center rounded-full font-medium text-xs",
							getAvatarColorClass(name),
						)}
					>
						{getInitials(name)}
					</span>
					<div className="min-w-0">
						<p className="truncate font-semibold text-sm">{name}</p>
						{courseTitle && (
							<p className="truncate text-muted-foreground text-xs">
								{courseTitle}
							</p>
						)}
					</div>
				</>
			)}
		</div>
	);
}

function MessageList({ messages, otherParticipantName }: MessageListProps) {
	if (messages.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
				No messages yet. Say hello.
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			{messages.map((m, i) => {
				const date = new Date(m.createdAt);
				const prev = messages[i - 1];
				const next = messages[i + 1];
				const prevDate = prev ? new Date(prev.createdAt) : null;
				const nextDate = next ? new Date(next.createdAt) : null;

				const showDate = !prevDate || !isSameDay(prevDate, date);
				const isFirstInGroup = showDate || prev?.senderId !== m.senderId;
				const isLastInGroup =
					!nextDate ||
					next?.senderId !== m.senderId ||
					!isSameDay(date, nextDate);

				return (
					<div key={m.id}>
						{showDate && <DateSeparator date={date} />}
						<MessageBubble
							isFirstInGroup={isFirstInGroup}
							isLastInGroup={isLastInGroup}
							message={m}
							otherParticipantName={otherParticipantName}
						/>
					</div>
				);
			})}
		</div>
	);
}

function DateSeparator({ date }: { date: Date }) {
	return (
		<div className="my-3 flex items-center gap-3">
			<span className="h-px flex-1 bg-border" />
			<span className="text-[11px] text-muted-foreground">
				{dateSeparatorLabel(date)}
			</span>
			<span className="h-px flex-1 bg-border" />
		</div>
	);
}

function MessageBubble({
	message: m,
	otherParticipantName,
	isFirstInGroup,
	isLastInGroup,
}: MessageBubbleProps) {
	const time = format(new Date(m.createdAt), "HH:mm");

	if (m.isMine) {
		return (
			<div
				className={cn(
					"flex flex-col items-end",
					isFirstInGroup ? "mt-3" : "mt-1",
				)}
			>
				<div
					className={cn(
						"w-fit max-w-[75%] whitespace-pre-wrap break-words rounded-2xl bg-primary px-3.5 py-2 text-primary-foreground text-sm",
						!isFirstInGroup && "rounded-tr-md",
					)}
				>
					{m.body}
					<span className="mt-0.5 block select-none text-right text-[10px] text-primary-foreground/70">
						{time}
					</span>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn("flex items-end gap-2", isFirstInGroup ? "mt-3" : "mt-1")}
		>
			{isLastInGroup ? (
				<span
					className={cn(
						"flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-[10px]",
						getAvatarColorClass(otherParticipantName),
					)}
				>
					{getInitials(otherParticipantName)}
				</span>
			) : (
				<span className="size-7 shrink-0" />
			)}
			<div
				className={cn(
					"w-fit max-w-[75%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-3.5 py-2 text-sm",
					!isFirstInGroup && "rounded-tl-md",
				)}
			>
				{m.body}
				<span className="mt-0.5 block select-none text-right text-[10px] text-muted-foreground">
					{time}
				</span>
			</div>
		</div>
	);
}

function Composer({ conversationId, onSent }: ComposerProps) {
	const [draft, setDraft] = useState("");

	const send = api.message.send.useMutation({
		onSuccess: () => {
			setDraft("");
			onSent();
		},
	});

	function submit() {
		const body = draft.trim();
		if (!body) return;
		send.mutate({ conversationId, body });
	}

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
}

function ThreadSkeleton() {
	return (
		<div className="flex flex-col gap-3">
			<Skeleton className="h-9 w-2/5 rounded-2xl" />
			<Skeleton className="ml-auto h-9 w-1/2 rounded-2xl" />
			<Skeleton className="h-16 w-3/5 rounded-2xl" />
			<Skeleton className="ml-auto h-9 w-1/3 rounded-2xl" />
		</div>
	);
}

function dateSeparatorLabel(date: Date): string {
	if (isToday(date)) return "Today";
	if (isYesterday(date)) return "Yesterday";
	return format(date, "MMMM d, yyyy");
}
