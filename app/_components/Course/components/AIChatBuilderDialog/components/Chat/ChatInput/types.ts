import type { ChatPanelProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatPanel/types";

export type ChatInputProps = Pick<
	ChatPanelProps,
	"value" | "isTyping" | "onInputChange" | "onSend"
>;
