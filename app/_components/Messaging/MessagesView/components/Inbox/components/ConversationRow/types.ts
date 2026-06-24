import type { ConversationSummary } from "@/server/entities/messaging/messaging.dto";

export type ConversationRowProps = {
	conversation: ConversationSummary;
	isActive: boolean;
	onSelect: (conversationId: string) => void;
};
