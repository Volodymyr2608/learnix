import type { Message } from "@/app/_components/Course/components/AIChatBuilderDialog/types";
import {
	createAssistantMessage,
	createUserMessage,
} from "../utils/messageFactory";

type UseChatActions = {
	addMessage: (m: Message) => void;
	streamAssistantMessage: (
		payload: { userMessage: string; courseGenerationId?: string },
		messageId: string,
	) => Promise<void>;
	courseGenerationId?: string;
	setInput: (v: string) => void;
};

export const useChatActions = ({
	addMessage,
	streamAssistantMessage,
	courseGenerationId,
	setInput,
}: UseChatActions) => {
	const sendUserMessage = async (text: string) => {
		if (!text.trim()) return;

		addMessage(createUserMessage(text));
		setInput("");

		const assistantMessage = createAssistantMessage();
		addMessage(assistantMessage);

		await streamAssistantMessage(
			{ userMessage: text, courseGenerationId },
			assistantMessage.id,
		);
	};

	return { sendUserMessage };
};
