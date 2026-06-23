"use client";

import { cn } from "@/lib/utils/cn";
import type { InboxProps } from "./types";

export function Inbox({
	conversations,
	isLoading,
	activeId,
	onSelect,
}: InboxProps) {
	return (
		<div className="flex h-full flex-col overflow-y-auto">
			{isLoading && (
				<p className="p-4 text-muted-foreground text-sm">Loading…</p>
			)}
			{!isLoading && conversations.length === 0 && (
				<p className="p-4 text-muted-foreground text-sm">
					No conversations yet.
				</p>
			)}
			{!isLoading &&
				conversations.map((c) => (
					<button
						className={cn(
							"flex flex-col gap-1 border-b px-4 py-3 text-left transition-colors hover:bg-accent/50",
							activeId === c.id && "bg-accent",
						)}
						key={c.id}
						onClick={() => onSelect(c.id)}
						type="button"
					>
						<div className="flex items-center justify-between gap-2">
							<span className="font-medium text-sm">
								{c.otherParticipantName}
							</span>
							{c.unreadCount > 0 && (
								<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-primary-foreground text-xs">
									{c.unreadCount > 9 ? "9+" : c.unreadCount}
								</span>
							)}
						</div>
						<span className="text-muted-foreground text-xs">
							{c.courseTitle}
						</span>
						<span className="truncate text-muted-foreground text-xs">
							{c.lastMessagePreview}
						</span>
					</button>
				))}
		</div>
	);
}
