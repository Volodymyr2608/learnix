import type { ChatPanelProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatPanel/types";

export type ChatMessagesProps = Pick<
	ChatPanelProps,
	| "messages"
	| "isTyping"
	| "onSuggestionClick"
	| "onAcceptBlock"
	| "onRegenerateBlock"
>;
