import type { DraftStep } from "@/generated/prisma";
import type { ChatRoleType, CourseGenerationWithRelations } from "@/prisma/zod";

export interface Message {
	id: string;
	role: ChatRoleType;
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
