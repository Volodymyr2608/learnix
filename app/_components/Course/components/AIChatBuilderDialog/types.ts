import type { DraftStep } from "@/generated/prisma";

export interface CourseData {
	title: string;
	subtitle: string;
	description: string;
	category: string;
	level: string;
	language: string;
	duration: string;
	objectives: { value: string }[];
	requirements: { value: string }[];
	curriculum: {
		id: number;
		title: string;
		lessons: { id: number; title: string; duration: string }[];
	}[];
}

export interface Message {
	id: string;
	role: "assistant" | "user";
	content: string;
	isStreaming?: boolean;
	suggestions?: string[];
	showActions?: boolean;
	step?: DraftStep;
}

export interface AIChatBuilderDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onApply: (data: CourseData) => void;
}
