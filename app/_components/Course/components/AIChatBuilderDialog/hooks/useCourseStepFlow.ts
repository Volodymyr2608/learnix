import type { Dispatch, SetStateAction } from "react";
import type { DraftStep } from "@/generated/prisma";
import { STEP_MESSAGES } from "@/lib/constants/stepMessages";
import { STEPS } from "../constants/steps";
import type { Message } from "../types";
import { createAssistantMessage } from "../utils/messageFactory";
import { useCommitCourseStep } from "./useCommitCourseStep";

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
		const assistantMessage = createAssistantMessage();
		addMessage(assistantMessage);

		await commitStep.mutateAsync({ courseGenerationId });

		setCompletedSteps((prev) => [...prev, step]);

		const nextStep = currentStep + 1;
		setCurrentStep(nextStep);

		if (nextStep >= STEPS.length) {
			await simulateTyping(
				"Your course draft is complete! You can review everything in the preview panel.",
				assistantMessage.id,
			);
			return;
		}

		const nextStepId = STEPS[nextStep]?.id;
		if (!nextStepId) return;

		await simulateTyping(
			STEP_MESSAGES[nextStepId] ?? "Let's continue building your course.",
			assistantMessage.id,
		);
	};

	return { acceptStep };
};
