import { isSameDay } from "date-fns";
import { DateSeparator } from "../DateSeparator";
import { MessageBubble } from "../MessageBubble";
import type { MessageListProps } from "./types";

export const MessageList = ({
	messages,
	otherParticipantName,
}: MessageListProps) => {
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
};
