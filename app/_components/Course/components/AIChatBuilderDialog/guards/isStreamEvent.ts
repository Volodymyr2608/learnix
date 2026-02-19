import type { DraftStep } from "@/generated/prisma";

export type StreamEvent =
	| { type: "token"; value: string }
	| { type: "start"; courseGenerationId: string }
	| { type: "actions"; currentStep: DraftStep }
	| { type: "error"; message: string };

export const isStreamEvent = (data: unknown): data is StreamEvent => {
	if (typeof data !== "object" || data === null) return false;
	if (!("type" in data)) return false;

	const event = data as Record<string, unknown>;

	switch (event.type) {
		case "token":
			return typeof event.value === "string";

		case "start":
			return typeof event.courseGenerationId === "string";

		case "actions":
			return typeof event.currentStep === "string";

		case "error":
			return typeof event.message === "string";

		default:
			return false;
	}
};
