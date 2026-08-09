import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";

const { mockLogSecurityEvent } = vi.hoisted(() => ({
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));

const { authorizeMarkConceptUnderstood, CONVERSATION_MAX_LEVEL } = await import(
	"./toolPolicy"
);

const ctx = (lessonConcepts: string[]) => ({
	userId: "user-1",
	lessonConcepts,
});

describe("authorizeMarkConceptUnderstood", () => {
	beforeEach(() => mockLogSecurityEvent.mockClear());

	it("denies when the allowlist is empty", () => {
		const result = authorizeMarkConceptUnderstood(
			{ concept: "Recursion", level: 1 },
			ctx([]),
		);
		expect(result).toEqual({
			authorized: false,
			message: NEUTRAL_REFUSAL_MESSAGE,
		});
	});

	it("denies a concept that is not on the allowlist", () => {
		const result = authorizeMarkConceptUnderstood(
			{ concept: "Course completed in full", level: 2 },
			ctx(["Recursion", "Base case"]),
		);
		expect(result.authorized).toBe(false);
	});

	it("denies a level above the conversation ceiling", () => {
		const result = authorizeMarkConceptUnderstood(
			{ concept: "Recursion", level: 3 },
			ctx(["Recursion"]),
		);
		expect(result.authorized).toBe(false);
		expect(CONVERSATION_MAX_LEVEL).toBe(2);
	});

	it("allows the ceiling itself", () => {
		const result = authorizeMarkConceptUnderstood(
			{ concept: "Recursion", level: 2 },
			ctx(["Recursion"]),
		);
		expect(result).toEqual({ authorized: true, canonicalConcept: "Recursion" });
	});

	it("matches case-insensitively after trimming and returns the canonical spelling", () => {
		const result = authorizeMarkConceptUnderstood(
			{ concept: "  recursion ", level: 1 },
			ctx(["Recursion"]),
		);
		expect(result).toEqual({ authorized: true, canonicalConcept: "Recursion" });
	});

	it("emits unsafe_tool_call on denial, with no concept name in the event", () => {
		authorizeMarkConceptUnderstood(
			{ concept: "Course completed in full", level: 2 },
			ctx(["Recursion"]),
		);

		expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
		const event = mockLogSecurityEvent.mock.calls[0]?.[0];
		expect(event).toMatchObject({
			feature: "lessonAI",
			layer: "tool_policy",
			outcome: "unsafe_tool_call",
		});
		expect(JSON.stringify(event)).not.toContain("Course completed in full");
	});

	it("emits nothing when the call is authorized", () => {
		authorizeMarkConceptUnderstood(
			{ concept: "Recursion", level: 1 },
			ctx(["Recursion"]),
		);
		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});
});
