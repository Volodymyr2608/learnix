import type { ChatMessagesProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatMessages/types";

export type ChatMessageProps = Omit<ChatMessagesProps, "messages"> & {
	message: ChatMessagesProps["messages"][number];
	isLastMessage: boolean;
	countMessages: number;
	showAcceptButton?: boolean;
	lastAutoAdvanced?: boolean;
};
