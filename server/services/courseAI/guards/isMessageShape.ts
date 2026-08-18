import type { CourseGenerationMessage, DraftStep } from "@/generated/prisma";

export type MessageShape = {
	role: "user" | "assistant";
	content: string;
	step: DraftStep;
	/**
	 * Omitted on an ordinary turn. Set to false by the caller when this turn
	 * elicited a reply the output boundary retracted: the row still renders in
	 * the thread, but hydrateState never feeds it back to a model.
	 */
	contextEligible?: boolean;
};

export const isMessageShape = (
	m: CourseGenerationMessage,
): m is CourseGenerationMessage & MessageShape =>
	(m.role === "user" || m.role === "assistant") &&
	typeof m.content === "string" &&
	m.step !== null;
