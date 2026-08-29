import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogSecurityEvent } = vi.hoisted(() => ({
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));

const { buildAskConceptCheckTool } = await import("./askConceptCheck.tool");
const { newTurnState } = await import("../turnState");

const CONCEPTS = ["Recursion"];

const authored = {
	concept: "Recursion",
	question: "Which call ends a recursive descent?",
	options: [
		"The base case",
		"The first recursive call",
		"The outermost frame",
		"The largest input",
	],
	correctOption: "The base case",
};

const groundedTurn = () => {
	const turn = newTurnState();
	turn.grounded = true;
	return turn;
};

const build = (turn = groundedTurn()) => ({
	turn,
	tool: buildAskConceptCheckTool("student-1", "lesson-1", CONCEPTS, turn),
});

describe("ask_concept_check", () => {
	beforeEach(() => mockLogSecurityEvent.mockClear());

	it("buffers the authored check rather than writing it", async () => {
		const { tool, turn } = build();

		await tool.invoke(authored);

		expect(turn.pendingCheck).toMatchObject({
			studentId: "student-1",
			lessonId: "lesson-1",
			concept: "Recursion",
			correctOption: "The base case",
		});
	});

	it("stores the allowlist's spelling, not the model's", async () => {
		const { tool, turn } = build();

		await tool.invoke({ ...authored, concept: "  recursion " });

		expect(turn.pendingCheck?.concept).toBe("Recursion");
	});

	it("buffers nothing on a turn that never read the lesson", async () => {
		const { tool, turn } = build(newTurnState());

		await tool.invoke(authored);

		expect(turn.pendingCheck).toBeNull();
	});

	it("keeps the first check when the model authors a second", async () => {
		const { tool, turn } = build();

		await tool.invoke(authored);
		await tool.invoke({
			...authored,
			question: "Which of these is the smallest input?",
		});

		expect(turn.pendingCheck?.question).toBe(authored.question);
	});

	/**
	 * The result re-enters the model's context for the rest of the turn. If it
	 * echoed any part of the check, the answer key would be sitting in the one
	 * place the design keeps it out of, and "what was that question again?" would
	 * read it back.
	 */
	it("acknowledges without repeating any part of the check", async () => {
		const { tool } = build();

		const result = await tool.invoke(authored);
		const text = String(result);

		const args = [
			authored.concept,
			authored.question,
			authored.correctOption,
			...authored.options,
		];
		for (const arg of args) {
			for (let i = 0; i + 8 <= arg.length; i++) {
				expect(text).not.toContain(arg.slice(i, i + 8));
			}
		}
	});

	it("says nothing about the check when it refuses either", async () => {
		const { tool } = build(newTurnState());

		const text = String(await tool.invoke(authored));

		expect(text).not.toContain("base case");
		expect(text).not.toContain("Recursion");
	});

	it("never throws, so the agent loop can recover", async () => {
		const { tool } = build();

		await expect(
			tool.invoke({ ...authored, concept: "Not a lesson concept" }),
		).resolves.toBeTypeOf("string");
	});
});
