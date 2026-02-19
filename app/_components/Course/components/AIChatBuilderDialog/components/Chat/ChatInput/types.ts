import type { ChatPanelProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatPanel/types";

export type ChatInputProps = {
	value: string;
} & Pick<ChatPanelProps, "isTyping" | "onInputChange" | "onSend">;
