import type { DraftStep } from "@/generated/prisma";
import type { Message } from "../types";
import { createAssistantMessage } from "../utils/messageFactory";

type UseCourseStepFlowProps = {
	addMessage: (message: Message) => void;
	courseGenerationId?: string;
	streamFinalize: (
		payload: { courseGenerationId: string },
		messageId: string,
	) => Promise<void>;
	onAssistantPlaceholder?: (id: string) => void;
};

export const useCourseStepFlow = ({
	addMessage,
	courseGenerationId,
	streamFinalize,
	onAssistantPlaceholder,
}: UseCourseStepFlowProps) => {
	const acceptStep = async (_step: DraftStep) => {
		if (!courseGenerationId) return;
		const assistantMessage = createAssistantMessage();
		addMessage(assistantMessage);
		onAssistantPlaceholder?.(assistantMessage.id);
		await streamFinalize({ courseGenerationId }, assistantMessage.id);
	};

	return { acceptStep };
};