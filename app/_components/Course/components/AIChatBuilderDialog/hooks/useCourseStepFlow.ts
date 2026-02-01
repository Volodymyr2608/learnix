import type { Dispatch, SetStateAction } from "react";
import { useCommitCourseStep } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useCommitCourseStepю";
import type { DraftStep } from "@/generated/prisma";
import { STEP_MESSAGES } from "../constants/stepMessages";
import { STEPS } from "../constants/steps";
import type { Message } from "../types";
import { createAssistantMessage } from "../utils/messageFactory";

type UseCourseStepFlowProps = {
	currentStep: number;
	setCurrentStep: Dispatch<SetStateAction<number>>;
	setCompletedSteps: Dispatch<SetStateAction<DraftStep[]>>;
	addMessage: (message: Message) => void;
	simulateTyping: (text: string, messageId: string) => Promise<void>;
	courseGenerationId?: string;
};

export const useCourseStepFlow = ({
	currentStep,
	setCurrentStep,
	setCompletedSteps,
	addMessage,
	simulateTyping,
	courseGenerationId,
}: UseCourseStepFlowProps) => {
	const { commitStep } = useCommitCourseStep();

	const acceptStep = async (step: DraftStep) => {
		setCompletedSteps((prev) => [...prev, step]);

		const nextStep = currentStep + 1;
		setCurrentStep(nextStep);

		const assistantMessage = createAssistantMessage();
		addMessage(assistantMessage);

		if (nextStep < STEPS.length) {
			if (!courseGenerationId) return;

			await commitStep.mutateAsync({ courseGenerationId });

			const nextStepId = STEPS[nextStep]?.id;
			if (!nextStepId) return;

			await simulateTyping(
				STEP_MESSAGES[nextStepId] ??
					"Let's continue building your course.",
				assistantMessage.id,
			);
			return;
		}

		await simulateTyping(
			"Your course draft is complete! You can review everything in the preview panel.",
			assistantMessage.id,
		);
	};

	return { acceptStep };
};
