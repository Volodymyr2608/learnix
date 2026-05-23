import type { Message } from "../types";
import { createAssistantMessage } from "../utils/messageFactory";

type UseCourseStepFlowProps = {
	addMessage: (message: Message) => void;
	courseGenerationId?: string;
	streamFinalize: (
		payload: { courseGenerationId: string },
		messageId: string,
	) => Promise<void>;
};

export const useCourseStepFlow = ({
	addMessage,
	courseGenerationId,
	streamFinalize,
}: UseCourseStepFlowProps) => {
	const acceptStep = async () => {
		if (!courseGenerationId) return;
		const assistantMessage = createAssistantMessage();
		addMessage(assistantMessage);
		await streamFinalize({ courseGenerationId }, assistantMessage.id);
	};

	return { acceptStep };
};
