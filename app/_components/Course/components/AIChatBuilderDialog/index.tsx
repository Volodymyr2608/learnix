"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

	const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
	const [lastConfidence, setLastConfidence] = useState<number | null>(null);
	const [lastAutoAdvanced, setLastAutoAdvanced] = useState(false);
	const [showAcceptButton, setShowAcceptButton] = useState(false);
	const stepCommittedRef = useRef(false);
	const lastAssistantMessageIdRef = useRef<string | null>(null);

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
		onStreamEvent: (ev) => {
			if (ev.type === "tool_call") {
				setActiveToolCall(ev.name);
			} else if (ev.type === "token") {
				setActiveToolCall(null);
			} else if (ev.type === "confidence") {
				setLastConfidence(ev.value);
			} else if (ev.type === "step_committed") {
				stepCommittedRef.current = true;
				setLastAutoAdvanced(ev.autoAdvanced);

				const committedIndex = STEPS.findIndex((s) => s.id === ev.step);
				if (committedIndex >= 0) {
					setCurrentStep(committedIndex + 1);
					setCompletedSteps((prev) =>
						prev.includes(ev.step) ? prev : [...prev, ev.step],
					);
				}

				if (ev.autoAdvanced) {
					setShowAcceptButton(false);
				}
			} else if (ev.type === "done") {
				setActiveToolCall(null);
				if (!stepCommittedRef.current) {
					setShowAcceptButton(true);
				}
				stepCommittedRef.current = false;
			}
		},
	});

	const wrappedStreamAssistantMessage = useCallback(
		(
			payload: { userMessage: string; courseGenerationId?: string },
			messageId: string,
		) => {
			setShowAcceptButton(false);
			setLastAutoAdvanced(false);
			setLastConfidence(null);
			stepCommittedRef.current = false;
			lastAssistantMessageIdRef.current = messageId;
			return streamAssistantMessage(payload, messageId);
		},
		[streamAssistantMessage],
	);

	const { sendUserMessage } = useChatActions({
		addMessage,
		courseGenerationId,
		setInput,
		streamAssistantMessage: wrappedStreamAssistantMessage,
	});

	const { acceptStep } = useCourseStepFlow({
		addMessage,
		courseGenerationId,
		streamFinalize,
		onAssistantPlaceholder: (id) => {
			lastAssistantMessageIdRef.current = id;
		},
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
		setActiveToolCall(null);
		setLastConfidence(null);
		setLastAutoAdvanced(false);
		setShowAcceptButton(false);
		stepCommittedRef.current = false;
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
