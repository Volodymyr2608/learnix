import type { Dispatch, SetStateAction } from "react";
import type { Message } from "@/app/_components/Course/components/AIChatBuilderDialog/types";
import type { DraftStep } from "@/generated/prisma";

export interface ChatPanelProps {
	messages: Message[];
	input: string;
	isTyping: boolean;
	onSend: () => void;
	onInputChange: Dispatch<SetStateAction<string>>;
	onSuggestionClick: (v: string) => void;
	onAcceptBlock: (step: DraftStep) => Promise<void>;
	currentStep: number;
	completedSteps: string[];
	activeToolCall?: string | null;
	lastAutoAdvanced?: boolean;
	lastConfidence?: number | null;
	showAcceptButton?: boolean;
}
