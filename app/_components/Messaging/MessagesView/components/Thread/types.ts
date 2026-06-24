import type { ThreadMessage } from "@/server/entities/messaging/messaging.dto";

export type ThreadProps = {
	conversationId: string;
	onBack: () => void;
};

export type ThreadHeaderProps = {
	name: string;
	courseTitle: string;
	isLoading: boolean;
	onBack: () => void;
};

export type MessageListProps = {
	messages: ThreadMessage[];
	otherParticipantName: string;
};

export type MessageBubbleProps = {
	message: ThreadMessage;
	otherParticipantName: string;
	isFirstInGroup: boolean;
	isLastInGroup: boolean;
};

export type ComposerProps = {
	conversationId: string;
	onSent: () => void;
};
