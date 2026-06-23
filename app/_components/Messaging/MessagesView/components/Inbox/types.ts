import type { ConversationSummary } from "@/server/entities/messaging/messaging.dto";

export type InboxProps = {
	conversations: ConversationSummary[];
	isLoading: boolean;
	activeId: string | null;
	onSelect: (conversationId: string) => void;
};
