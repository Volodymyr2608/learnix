"use client";

import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/app/_components/_shared/ui/dialog";
import ChatPanel from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatPanel";
import PreviewPanel from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/PreviewPanel";
import { STEPS } from "@/app/_components/Course/components/AIChatBuilderDialog/constants/steps";
import { useChatActions } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useChatActions";
import { useChatState } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useChatState";
import { useChatStreaming } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useChatStreaming";
import { useCourseGenerationStatus } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useCourseGenerationStatus";
import { useCourseStepFlow } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useCourseStepFlow";
import { useTypingSimulation } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useTypingSimulation";
import type { AIChatBuilderDialogProps } from "@/app/_components/Course/components/AIChatBuilderDialog/types";
import { adaptCourse } from "@/app/_components/Course/components/AIChatBuilderDialog/utils/adaptCourse";
import type { DraftStep } from "@/generated/prisma";
import type {
	CourseSchemaInput,
	CourseSchemaOutput,
} from "@/server/entities/course";

const AIChatBuilderDialog = ({
	open,
	onOpenChange,
	activeCourseGeneration,
}: AIChatBuilderDialogProps) => {
	const { reset } = useFormContext<CourseSchemaInput>();
	const [currentStep, setCurrentStep] = useState(0);
	const [completedSteps, setCompletedSteps] = useState<DraftStep[]>([]);
	const [courseGenerationId, setCourseGenerationId] = useState<
		string | undefined
	>(activeCourseGeneration?.id);

	const {
		initializeMessages,
		messages,
		addMessage,
		updateMessage,
		resetChat,
		input,
		setInput,
	} = useChatState();

	const { simulateTyping, isTyping } = useTypingSimulation(updateMessage);

	const { streamAssistantMessage } = useChatStreaming(
		updateMessage,
		setCourseGenerationId,
	);

	const { sendUserMessage } = useChatActions({
		addMessage,
		courseGenerationId,
		setInput,
		streamAssistantMessage,
	});

	const { acceptStep } = useCourseStepFlow({
		addMessage,
		courseGenerationId,
		currentStep,
		setCompletedSteps,
		setCurrentStep,
		simulateTyping,
	});

	useEffect(() => {
		if (!open) return;

		initializeMessages(activeCourseGeneration?.messages);

		if (activeCourseGeneration) {
			const stepIndex = STEPS.findIndex(
				(s) => s.id === activeCourseGeneration.step,
			);

			let currentIndex = stepIndex >= 0 ? stepIndex : 0;

			if (
				typeof activeCourseGeneration.content === "object" &&
				activeCourseGeneration.content !== null &&
				"sections" in activeCourseGeneration.content
			) {
				currentIndex += 1;
			}
			setCurrentStep(currentIndex);

			const completed = STEPS.slice(0, currentIndex).map((s) => s.id);
			setCompletedSteps(completed);
		}
	}, [open, initializeMessages, activeCourseGeneration]);

	const { setStatus, isPending: isApplyPending } = useCourseGenerationStatus();

	const handleApply = async (data: CourseSchemaOutput) => {
		if (courseGenerationId) {
			await setStatus(courseGenerationId, "completed");
		}

		reset(adaptCourse(data));
		handleClose();
		toast.success("✨ Course data successfully applied ");
	};

	const handleClose = () => {
		onOpenChange(false);
		resetChat();
		setCurrentStep(0);
		setCompletedSteps([]);
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="h-[85vh] gap-0 overflow-hidden p-0 lg:max-w-6xl">
				<div className="flex h-full">
					<ChatPanel
						completedSteps={completedSteps}
						currentStep={currentStep}
						input={input}
						isTyping={isTyping}
						messages={messages}
						onAcceptBlock={acceptStep}
						onInputChange={setInput}
						onSend={() => sendUserMessage(input)}
						onSuggestionClick={sendUserMessage}
					/>

					<PreviewPanel
						completedSteps={completedSteps}
						courseGenerationId={courseGenerationId}
						isApplyPending={isApplyPending}
						onApply={handleApply}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default AIChatBuilderDialog;
