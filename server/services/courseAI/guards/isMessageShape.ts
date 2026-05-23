import type { CourseGenerationMessage, DraftStep } from "@/generated/prisma";

export type MessageShape = {
	role: "user" | "assistant";
	content: string;
	step: DraftStep;
};

export const isMessageShape = (
	m: CourseGenerationMessage,
): m is CourseGenerationMessage & MessageShape =>
	(m.role === "user" || m.role === "assistant") &&
	typeof m.content === "string" &&
	m.step !== null;
