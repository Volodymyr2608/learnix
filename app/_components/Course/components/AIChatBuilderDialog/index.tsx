"use client";

import { useCallback, useEffect, useState } from "react";
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
import { useStreamEvents } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useStreamEvents";
import { useTypingSimulation } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useTypingSimulation";
import type { AIChatBuilderDialogProps } from "@/app/_components/Course/components/AIChatBuilderDialog/types";
import { adaptCourse } from "@/app/_components/Course/components/AIChatBuilderDialog/utils/adaptCourse";
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
	const [courseGenerationId, setCourseGenerationId] = useState<
		string | undefined
	>(activeCourseGeneration?.id);

	const {
		currentStep,
		setCurrentStep,
		completedSteps,
		setCompletedSteps,
		activeToolCall,
		lastConfidence,
		lastAutoAdvanced,
		showAcceptButton,
		onStreamEvent,
		triggerNextStepRef,
		resetBeforeStream,
		resetAll,
	} = useStreamEvents();

	const {
		initializeMessages,
		messages,
		addMessage,
		updateMessage,
		resetChat,
		input,
		setInput,
	} = useChatState();

	const { isTyping } = useTypingSimulation(updateMessage);

	const { streamAssistantMessage, streamFinalize } = useChatStreaming({
		updateMessage,
		setCourseGenerationId,
		onStreamEvent,
	});

	const wrappedStreamAssistantMessage = useCallback(
		(
			payload: { userMessage: string; courseGenerationId?: string },
			messageId: string,
		) => {
			resetBeforeStream();
			return streamAssistantMessage(payload, messageId);
		},
		[streamAssistantMessage, resetBeforeStream],
	);

	const { sendUserMessage, triggerNextStep } = useChatActions({
		addMessage,
		courseGenerationId,
		setInput,
		streamAssistantMessage: wrappedStreamAssistantMessage,
	});

	// Keep the ref current each render so onStreamEvent always calls the latest version.
	triggerNextStepRef.current = triggerNextStep;

	const { acceptStep } = useCourseStepFlow({
		addMessage,
		courseGenerationId,
		streamFinalize,
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
			setCompletedSteps(STEPS.slice(0, currentIndex).map((s) => s.id));
		}
	}, [open, initializeMessages, activeCourseGeneration, setCurrentStep, setCompletedSteps]);

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
		resetAll();
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="flex h-[85vh] gap-0 overflow-hidden p-0 lg:max-w-6xl">
				<ChatPanel
					activeToolCall={activeToolCall}
					completedSteps={completedSteps}
					currentStep={currentStep}
					input={input}
					isTyping={isTyping}
					lastAutoAdvanced={lastAutoAdvanced}
					lastConfidence={lastConfidence}
					messages={messages}
					onAcceptBlock={acceptStep}
					onInputChange={setInput}
					onSend={() => sendUserMessage(input)}
					onSuggestionClick={sendUserMessage}
					showAcceptButton={showAcceptButton}
				/>

				<PreviewPanel
					completedSteps={completedSteps}
					courseGenerationId={courseGenerationId}
					isApplyPending={isApplyPending}
					onApply={handleApply}
				/>
			</DialogContent>
		</Dialog>
	);
};

export default AIChatBuilderDialog;