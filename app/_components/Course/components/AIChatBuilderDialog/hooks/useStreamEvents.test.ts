import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const GUARD = readFileSync(
	"app/_components/Course/components/AIChatBuilderDialog/guards/isStreamEvent.ts",
	"utf-8",
);
const REDUCER = readFileSync(
	"app/_components/Course/components/AIChatBuilderDialog/hooks/useStreamEvents.ts",
	"utf-8",
);
const STREAMING = readFileSync(
	"app/_components/Course/components/AIChatBuilderDialog/hooks/useChatStreaming.ts",
	"utf-8",
);

/** Event types the guard accepts, read off the union it declares. */
const acceptedTypes = (): string[] => {
	const union = GUARD.slice(
		GUARD.indexOf("export type StreamEvent ="),
		GUARD.indexOf("export const isStreamEvent"),
	);
	return [...union.matchAll(/type:\s*"(\w+)"/g)].map((m) => m[1] as string);
};

/** Event types the guard's switch actually validates. */
const validatedTypes = (): string[] =>
	[...GUARD.matchAll(/case "(\w+)":/g)].map((m) => m[1] as string);

describe("the stream-event union and its handlers stay in step", () => {
	it("validates every accepted event type", () => {
		const missing = acceptedTypes().filter(
			(type) => !validatedTypes().includes(type),
		);

		expect(missing, missing.join(", ")).toEqual([]);
	});

	it("handles retract somewhere — the reducer or the streaming hook", () => {
		// It is the frame that withdraws text already on screen; an accepted event
		// with no handler anywhere would leave the tokens standing.
		expect(REDUCER.includes('case "retract"')).toBe(true);
		expect(STREAMING.includes('parsed.type === "retract"')).toBe(true);
	});

	it("REPLACES the streamed content on retract rather than appending", () => {
		const block = STREAMING.slice(
			STREAMING.indexOf('parsed.type === "retract"'),
		);

		expect(block).toMatch(/content: parsed\.message/);
		expect(block).not.toMatch(/content: m\.content \+/);
	});

	it("clears the accept button on a retracted turn", () => {
		const block = REDUCER.slice(
			REDUCER.indexOf('case "retract"'),
			REDUCER.indexOf('case "done"'),
		);

		expect(block).toMatch(/setShowAcceptButton\(false\)/);
		expect(block).toMatch(/stepCommittedRef\.current = false/);
	});
});
