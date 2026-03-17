import type { CourseGenerationMessage, DraftStep } from "@/generated/prisma";
import type { ChatRoleType } from "@/prisma/zod";

export type MessageShape = {
	role: ChatRoleType;
	content: string;
	step: DraftStep;
};

export const isMessageShape = (courseGenMessage: CourseGenerationMessage) => {
	return (
		(courseGenMessage.role === "user" ||
			courseGenMessage.role === "assistant") &&
		typeof courseGenMessage.content === "string"
	);
};
