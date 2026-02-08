import type { DraftStep } from "@/generated/prisma";
import type {
	ChatRoleSchema,
	CourseGenerationWithRelations,
} from "@/prisma/zod";

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
	role: ChatRoleSchema;
	content: string;
	isStreaming?: boolean;
	suggestions?: string[];
	showActions?: boolean;
	step?: DraftStep;
}

export interface AIChatBuilderDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	activeCourseGeneration: CourseGenerationWithRelations | null;
}
