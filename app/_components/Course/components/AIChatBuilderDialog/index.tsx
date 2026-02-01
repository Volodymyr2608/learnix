"use client";

import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/app/_components/_shared/ui/dialog";
import ChatPanel from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatPanel";
import PreviewPanel from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/PreviewPanel";
import { initialCourseData } from "@/app/_components/Course/components/AIChatBuilderDialog/constants/initialCourseData";
import { WELCOME_MESSAGE } from "@/app/_components/Course/components/AIChatBuilderDialog/constants/welcomeMessage";
import { useChatActions } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useChatActions";
import { useChatState } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useChatState";
import { useChatStreaming } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useChatStreaming";
import { useCourseStepFlow } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useCourseStepFlow";
import { useTypingSimulation } from "@/app/_components/Course/components/AIChatBuilderDialog/hooks/useTypingSimulation";
import type {
	AIChatBuilderDialogProps,
	CourseData,
} from "@/app/_components/Course/components/AIChatBuilderDialog/types";
import type { DraftStep } from "@/generated/prisma";
import type { CourseSchemaInput } from "@/server/entities/course";

const AIChatBuilderDialog = ({
	open,
	onOpenChange,
}: AIChatBuilderDialogProps) => {
	const { reset } = useFormContext<CourseSchemaInput>();
	const [currentStep, setCurrentStep] = useState(0);
	const [courseData, setCourseData] = useState<CourseData>(initialCourseData);
	const [completedSteps, setCompletedSteps] = useState<DraftStep[]>([]);
	const [courseGenerationId, setCourseGenerationId] = useState<string>();

	const { messages, addMessage, updateMessage, resetChat, input, setInput } =
		useChatState();

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
		if (open && messages.length === 0) {
			addMessage(WELCOME_MESSAGE);
		}
	}, [open, addMessage, messages.length]);

	const handleRegenerateBlock = async () => {};

	const handleApply = (data) => {
		reset(data);
		handleClose();
		toast.success("✨ Course info updated");
	};

	const handleClose = () => {
		onOpenChange(false);
		resetChat();
		setCurrentStep(0);
		setCompletedSteps([]);
		setCourseData(initialCourseData);
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
						onRegenerateBlock={handleRegenerateBlock}
						onSend={() => sendUserMessage(input)}
						onSuggestionClick={sendUserMessage}
					/>

					<PreviewPanel
						completedSteps={completedSteps}
						courseData={courseData}
						courseGenerationId={courseGenerationId}
						onApply={handleApply}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default AIChatBuilderDialog;
