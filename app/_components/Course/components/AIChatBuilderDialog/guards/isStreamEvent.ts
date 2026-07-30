import type { DraftStep } from "@/generated/prisma";

export type StreamEvent =
	| { type: "token"; value: string }
	| { type: "start"; courseGenerationId: string }
	| { type: "tool_call"; name: string; args: Record<string, unknown> }
	| { type: "node_start"; node: string }
	| { type: "confidence"; value: number }
	| {
			type: "step_committed";
			step: DraftStep;
			autoAdvanced: boolean;
			confidence: number;
	  }
	| { type: "content_revised" }
	| { type: "error"; message: string; retryable: boolean }
	| { type: "guard_blocked"; message: string }
	| { type: "done" };

export const isStreamEvent = (data: unknown): data is StreamEvent => {
	if (typeof data !== "object" || data === null) return false;
	if (!("type" in data)) return false;

	const event = data as Record<string, unknown>;

	switch (event.type) {
		case "token":
			return typeof event.value === "string";
		case "start":
			return typeof event.courseGenerationId === "string";
		case "tool_call":
			return typeof event.name === "string" && typeof event.args === "object";
		case "node_start":
			return typeof event.node === "string";
		case "confidence":
			return typeof event.value === "number";
		case "step_committed":
			return (
				typeof event.step === "string" &&
				typeof event.autoAdvanced === "boolean" &&
				typeof event.confidence === "number"
			);
		case "content_revised":
			return true;
		case "error":
			return (
				typeof event.message === "string" &&
				typeof event.retryable === "boolean"
			);
		case "guard_blocked":
			return typeof event.message === "string";
		case "done":
			return true;
		default:
			return false;
	}
};
