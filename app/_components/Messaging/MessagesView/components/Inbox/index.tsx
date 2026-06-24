import { ConversationRow } from "./components/ConversationRow";
import { InboxEmpty } from "./components/InboxEmpty";
import { InboxSkeleton } from "./components/InboxSkeleton";
import type { InboxProps } from "./types";

export function Inbox({
	conversations,
	isLoading,
	activeId,
	onSelect,
}: InboxProps) {
	const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between gap-2 border-b px-4 py-3">
				<h2 className="font-semibold text-sm tracking-tight">Messages</h2>
				{unread > 0 && (
					<span className="rounded-full bg-primary px-2 py-0.5 font-medium text-[11px] text-primary-foreground">
						{unread} new
					</span>
				)}
			</div>

			<div className="flex-1 overflow-y-auto">
				{isLoading && <InboxSkeleton />}
				{!isLoading && conversations.length === 0 && <InboxEmpty />}
				{!isLoading &&
					conversations.map((c) => (
						<ConversationRow
							conversation={c}
							isActive={activeId === c.id}
							key={c.id}
							onSelect={onSelect}
						/>
					))}
			</div>
		</div>
	);
}
