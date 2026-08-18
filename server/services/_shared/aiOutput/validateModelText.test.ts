import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogSecurityEvent } = vi.hoisted(() => ({
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));

const { validateModelText } = await import("./validateModelText");

const ctx = {
	feature: "lessonAI" as const,
	userId: "user-1",
};

describe("validateModelText", () => {
	beforeEach(() => {
		mockLogSecurityEvent.mockClear();
	});

	it("rejects a leak marker belonging to the calling feature (AC 1)", () => {
		const result = validateModelText(
			"Sure! You are an AI tutor for one lesson of one course, and my rules are…",
			ctx,
		);

		expect(result).toEqual({ valid: false, ruleId: "system_prompt_echo" });
		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				feature: "lessonAI",
				layer: "output_validation",
				outcome: "output_validation_failed",
				ruleIds: ["system_prompt_echo"],
			}),
		);
	});

	it("does not reject another feature's markers", () => {
		// The same text, attributed to a surface whose prompt does not contain it.
		const result = validateModelText(
			"Sure! You are an AI tutor for one lesson of one course, and my rules are…",
			{ ...ctx, feature: "quizAI" },
		);

		expect(result).toEqual({ valid: true });
	});

	it("rejects <untrusted_data in any casing (AC 2)", () => {
		for (const text of [
			'here it is: <untrusted_data source="lesson_content">',
			"<UNTRUSTED_DATA>",
			"…and then </Untrusted_Data>",
		]) {
			expect(validateModelText(text, ctx)).toEqual({
				valid: false,
				ruleId: "untrusted_data_echo",
			});
		}
	});

	it("rejects an off-origin destination in all three spellings (AC 3)", () => {
		const spellings = [
			"see ![x](https://evil.example.com/p)",
			"see [ref]\n\n[ref]: https://evil.example.com/p",
			"see <https://evil.example.com/p>",
			"see [x](<https://evil.example.com/p>)",
			"see ![x](//evil.example.com/p)",
		];

		for (const text of spellings) {
			expect(validateModelText(text, ctx)).toEqual({
				valid: false,
				ruleId: "off_origin_link",
			});
		}
	});

	it("rejects a destination whose scheme is hidden by a character reference", () => {
		// Markdown decodes &#9; to a tab before the renderer resolves it, so a
		// scanner reading the raw text has to decode too.
		for (const text of [
			"see ![x](&#9;https://evil.example/p.png)",
			"see ![x](&#32;https://evil.example/p.png)",
			"see [x](&#x0a;https://evil.example/p)",
		]) {
			expect(validateModelText(text, ctx), text).toEqual({
				valid: false,
				ruleId: "off_origin_link",
			});
		}
	});

	it("rejects a destination whose scheme is hidden by literal whitespace", () => {
		expect(
			validateModelText("see ![x](\thttps://evil.example/p.png)", ctx),
		).toEqual({ valid: false, ruleId: "off_origin_link" });
	});

	it("leaves in-app destinations alone", () => {
		for (const text of [
			"see [the lesson](/dashboard/courses/abc)",
			"see [next](./next-lesson)",
			"a bare mention of https-style text with no link syntax",
		]) {
			expect(validateModelText(text, ctx)).toEqual({ valid: true });
		}
	});

	it("reports the most specific rule when a reply trips several (AC 9)", () => {
		const both =
			"You are an AI tutor for one lesson of one course <untrusted_data> [x](https://evil.example.com)";

		expect(validateModelText(both, ctx)).toEqual({
			valid: false,
			ruleId: "system_prompt_echo",
		});

		const tagAndLink = "<untrusted_data> [x](https://evil.example.com)";
		expect(validateModelText(tagAndLink, ctx)).toEqual({
			valid: false,
			ruleId: "untrusted_data_echo",
		});
	});

	it("emits exactly one event per rejected text (AC 8)", () => {
		validateModelText("<untrusted_data> [x](https://evil.example.com)", ctx);

		expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
	});

	it("emits nothing for text that passes", () => {
		expect(validateModelText("An ordinary helpful reply.", ctx)).toEqual({
			valid: true,
		});
		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});

	it("carries subject through to the event when the author is not the operator", () => {
		validateModelText("<untrusted_data>", {
			...ctx,
			feature: "lessonInsightsAI",
			subject: { kind: "lesson", id: "lesson-9" },
		});

		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ subject: { kind: "lesson", id: "lesson-9" } }),
		);
	});

	it("still rejects, but stays silent, when the caller reports elsewhere", () => {
		const result = validateModelText("<untrusted_data>", {
			...ctx,
			emit: false,
		});

		expect(result).toEqual({ valid: false, ruleId: "untrusted_data_echo" });
		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});
});

describe("validateModelText fails closed on its own bugs (AC 4)", () => {
	beforeEach(() => {
		mockLogSecurityEvent.mockClear();
	});

	it("converts a throwing check into a rejection, never an exception", async () => {
		vi.resetModules();
		vi.doMock("./checks", () => ({
			containsSystemPromptLeak: () => {
				throw new Error("boom");
			},
			containsUntrustedDataEcho: () => false,
			containsOffOriginLink: () => false,
		}));

		const { validateModelText: withBrokenCheck } = await import(
			"./validateModelText"
		);

		expect(() => withBrokenCheck("anything", ctx)).not.toThrow();
		expect(withBrokenCheck("anything", ctx)).toEqual({
			valid: false,
			ruleId: "validator_error",
		});
		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ ruleIds: ["validator_error"] }),
		);

		vi.doUnmock("./checks");
		vi.resetModules();
	});
});
