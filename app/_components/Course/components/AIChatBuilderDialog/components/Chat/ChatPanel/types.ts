import type { Dispatch, SetStateAction } from "react";
import type { Message } from "@/app/_components/Course/components/AIChatBuilderDialog/types";

export interface ChatPanelProps {
	messages: Message[];
	input: string;
	isTyping: boolean;
	onSend: () => void;
	onInputChange: Dispatch<SetStateAction<string>>;
	onSuggestionClick: (v: string) => void;
	onAcceptBlock: (block: string) => void;
	onRegenerateBlock: (block: string) => void;
	currentStep: number;
	completedSteps: string[];
}
