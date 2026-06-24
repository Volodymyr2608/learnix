import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { getAvatarColorClass, getInitials } from "../../../../utils";
import type { ConversationRowProps } from "./types";

export function ConversationRow({
	conversation: c,
	isActive,
	onSelect,
}: ConversationRowProps) {
	const hasUnread = c.unreadCount > 0;

	return (
		<button
			className={cn(
				"relative flex w-full cursor-pointer items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent/60",
				isActive && "bg-accent",
			)}
			onClick={() => onSelect(c.id)}
			type="button"
		>
			{isActive && (
				<span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
			)}
			<span
				className={cn(
					"flex size-10 shrink-0 items-center justify-center rounded-full font-medium text-xs",
					getAvatarColorClass(c.otherParticipantName),
				)}
			>
				{getInitials(c.otherParticipantName)}
			</span>

			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex items-baseline justify-between gap-2">
					<span
						className={cn(
							"truncate text-sm",
							hasUnread ? "font-semibold" : "font-medium",
						)}
					>
						{c.otherParticipantName}
					</span>
					<span className="shrink-0 text-[11px] text-muted-foreground">
						{formatDistanceToNowStrict(new Date(c.lastMessageAt))}
					</span>
				</span>

				<span className="truncate text-muted-foreground text-xs">
					{c.courseTitle}
				</span>

				<span className="flex items-center justify-between gap-2">
					<span
						className={cn(
							"truncate text-xs",
							hasUnread
								? "font-medium text-foreground"
								: "text-muted-foreground",
						)}
					>
						{c.lastMessagePreview}
					</span>
					{hasUnread && (
						<span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-medium text-[11px] text-primary-foreground">
							{c.unreadCount > 9 ? "9+" : c.unreadCount}
						</span>
					)}
				</span>
			</span>
		</button>
	);
}
