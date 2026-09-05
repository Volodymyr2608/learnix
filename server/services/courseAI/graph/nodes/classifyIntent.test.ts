import { describe, expect, it, vi } from "vitest";
import { DraftStep } from "@/generated/prisma";

const { mockInvoke, mockLogSecurityEvent } = vi.hoisted(() => ({
	mockInvoke: vi.fn(),
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("@langchain/openai", () => {
	class ChatOpenAI {
		withStructuredOutput() {
			return this;
		}
		invoke(messages: unknown) {
			return mockInvoke(messages);
		}
	}
	return { ChatOpenAI };
});

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));

const { classifyIntent } = await import("./classifyIntent");

const state = (over: Record<string, unknown> = {}) => ({
	generationId: "gen-1",
	instructorId: "ins-1",
	currentStep: DraftStep.objectives,
	content: {},
	history: [
		{
			role: "user" as const,
			content: "a course about python",
			step: DraftStep.basic,
		},
	],
	mode: "chat" as const,
	userMessage: "change the level to Advanced",
	intent: null,
	reviseTarget: null,
	toolCalls: [],
	pendingToolCalls: [],
	assessReady: false,
	assessClarify: null,
	draftStepData: undefined,
	confidence: 0,
	shouldAutoAdvance: false,
	assistantText: "",
	validationErrors: null,
	outputRejected: false,
	messages: [],
	...over,
});

const run = (over: Record<string, unknown> = {}) =>
	classifyIntent(state(over), {});

const promptOf = (): string => {
	const messages = mockInvoke.mock.calls[0]?.[0] as
		| { content: string }[]
		| undefined;
	return messages?.[0]?.content ?? "";
};

describe("classify_intent — the step is resolved, never named by the model", () => {
	it("resolves a field the model named to the step that stores it", async () => {
		mockInvoke.mockResolvedValueOnce({
			intent: "revise",
			reviseField: "level",
			reason: "",
		});

		expect(await run()).toEqual({
			intent: "revise",
			reviseTarget: DraftStep.basic,
		});
	});

	/**
	 * The dead end this replaces: revise_prior_field answers a null target with
	 * "I couldn't tell which field to revise", which ends the turn without asking
	 * the instructor anything. A question is recoverable; that sentence is not.
	 */
	it("turns an unresolvable field into a clarify, never a revise with no target", async () => {
		mockInvoke.mockResolvedValueOnce({
			intent: "revise",
			reviseField: "price",
			reason: "Which part of the course did you mean?",
		});

		const out = await run();

		expect(out.intent).toBe("clarify");
		expect(out.reviseTarget).toBeNull();
	});

	it("leaves continue alone", async () => {
		mockInvoke.mockResolvedValueOnce({
			intent: "continue",
			reviseField: null,
			reason: "",
		});

		expect(await run()).toEqual({ intent: "continue", reviseTarget: null });
	});

	it("still short-circuits an empty message without calling the model", async () => {
		mockInvoke.mockClear();

		expect(await run({ userMessage: "" })).toEqual({
			intent: "continue",
			reviseTarget: null,
		});
		expect(mockInvoke).not.toHaveBeenCalled();
	});
});

/**
 * An INPUT contract, deliberately. Whether the model then answers "continue"
 * for a step storing nothing is what the eval measures — asserting it against a
 * stub would be measuring the stub, which is the fiction `promptFidelity`
 * exists to prevent.
 */
describe("classify_intent — what the step has already stored is an input", () => {
	it("says nothing is stored when the current step has no saved keys", async () => {
		mockInvoke.mockClear();
		mockInvoke.mockResolvedValueOnce({
			intent: "continue",
			reviseField: null,
			reason: "",
		});

		await run({ currentStep: DraftStep.objectives, content: {} });

		expect(promptOf()).toMatch(/stored nothing|nothing stored|no stored/i);
	});

	it("names the keys the current step has stored", async () => {
		mockInvoke.mockClear();
		mockInvoke.mockResolvedValueOnce({
			intent: "continue",
			reviseField: null,
			reason: "",
		});

		await run({
			currentStep: DraftStep.basic,
			// A message naming neither key, so the assertion cannot pass on the
			// user's own words leaking into the prompt.
			userMessage: "make it harder",
			content: { title: "Intro to Python", level: "Beginner" },
		});

		expect(promptOf()).toMatch(/ALREADY STORED[^\n]*\btitle\b/i);
		expect(promptOf()).toMatch(/ALREADY STORED[^\n]*\blevel\b/i);
	});

	/**
	 * Earlier steps' content is shown, attributed to the step that holds it.
	 *
	 * Scoping this line to the current step was the first attempt and it cost
	 * four rows: `revise` is mostly a request about an EARLIER step ("go back and
	 * add a 5th objective"), so a prompt saying only that the current step holds
	 * nothing reads as "nothing is stored anywhere" and routes those turns to
	 * `continue`. Attribution is what keeps the current step distinguishable
	 * inside a list that now spans all four.
	 */
	it("attributes stored keys to the step that holds them", async () => {
		mockInvoke.mockClear();
		mockInvoke.mockResolvedValueOnce({
			intent: "continue",
			reviseField: null,
			reason: "",
		});

		await run({
			currentStep: DraftStep.objectives,
			userMessage: "add one about pandas",
			content: { title: "Intro to Python" },
		});

		expect(promptOf()).toMatch(/ALREADY STORED[^\n]*basic:[^\n]*\btitle\b/i);
		expect(promptOf()).not.toMatch(/objectives:/i);
	});
});

describe("classify_intent — a swallowed model error leaves a trace", () => {
	it("emits fallback_triggered and still fails open to continue", async () => {
		mockInvoke.mockClear();
		mockLogSecurityEvent.mockClear();
		mockInvoke.mockRejectedValueOnce(new Error("provider down"));

		expect(await run()).toEqual({ intent: "continue", reviseTarget: null });

		expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
		expect(mockLogSecurityEvent.mock.calls[0]?.[0]).toEqual({
			feature: "courseAI",
			userId: "ins-1",
			layer: "model_call_fallback",
			outcome: "fallback_triggered",
			ruleIds: ["classify_intent_unavailable"],
			score: 0,
			subject: { kind: "generation", id: "gen-1" },
		});
	});

	it("emits nothing on a successful call", async () => {
		mockInvoke.mockClear();
		mockLogSecurityEvent.mockClear();
		mockInvoke.mockResolvedValueOnce({
			intent: "continue",
			reviseField: null,
			reason: "",
		});

		await run();

		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});
});
