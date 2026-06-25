import type { ThreadMessage } from "@/server/entities/messaging/messaging.dto";

export type MessageListProps = {
	messages: ThreadMessage[];
	otherParticipantName: string;
};
