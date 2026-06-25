import type { ThreadMessage } from "@/server/entities/messaging/messaging.dto";

export type MessageBubbleProps = {
	message: ThreadMessage;
	otherParticipantName: string;
	isFirstInGroup: boolean;
	isLastInGroup: boolean;
};
