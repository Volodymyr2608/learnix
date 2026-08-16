import { describe, expect, it, vi } from "vitest";

const { mockChatOpenAI, mockInvoke } = vi.hoisted(() => ({
	mockChatOpenAI: vi.fn(),
	mockInvoke: vi.fn().mockResolvedValue({ onTopic: true, reason: "ok" }),
}));

vi.mock("@langchain/openai", () => ({
	ChatOpenAI: class {
		constructor(config: Record<string, unknown>) {
			mockChatOpenAI(config);
		}
		withStructuredOutput() {
			return { invoke: mockInvoke };
		}
	},
}));

const { checkTopicRelevance } = await import("./topicRelevance");

const domain = { description: "the course", subject: "the course" };

describe("checkTopicRelevance", () => {
	// L2 sits in the request path of every tutor turn, before the first token.
	// Without a budget the SDK default is minutes with retries, and
	// guardUserInput's fail-open never fires because a hang is not an error —
	// the student just waits, and no fallback_triggered is emitted.
	it("declares a timeout and bounded retries", async () => {
		await checkTopicRelevance("what is recursion?", domain);

		expect(mockChatOpenAI).toHaveBeenCalledWith(
			expect.objectContaining({ timeout: 3_000, maxRetries: 1 }),
		);
	});

	it("still wraps the message as untrusted data", async () => {
		await checkTopicRelevance("what is recursion?", domain);

		const [messages] = mockInvoke.mock.calls.at(-1) ?? [];
		const user = (messages as { role: string; content: string }[]).find(
			(m) => m.role === "user",
		);
		expect(user?.content).toContain("<untrusted_data");
	});
});