import type { ChatHeaderProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatHeader/types";

export type ProgressStepsProps = Pick<
	ChatHeaderProps,
	"currentStep" | "completedSteps"
>;
