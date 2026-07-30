import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeUser } from "@/test/factories";

const {
	mockGetSession,
	mockCheckTopicRelevance,
	mockRunChat,
	mockGetOrCreate,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockCheckTopicRelevance: vi.fn(),
	mockRunChat: vi.fn(),
	mockGetOrCreate: vi.fn(),
}));

vi.mock("@/server/better-auth/server", () => ({ getSession: mockGetSession }));
vi.mock("@/server/services/_shared/aiGuard/topicRelevance", () => ({
	checkTopicRelevance: mockCheckTopicRelevance,
}));
vi.mock("@/server/services/courseAI/courseAI.service", () => ({
	courseAIService: {
		getOrCreateCourseGeneration: mockGetOrCreate,
		runChat: mockRunChat,
		runFinalize: vi.fn(),
		saveMessage: vi.fn().mockResolvedValue(undefined),
	},
}));

const { POST } = await import("./route");
const { RetryableNodeError, FatalNodeError } = await import(
	"@/server/services/courseAI/courseAI.errors"
);

const readSse = async (res: Response): Promise<string> =>
	res.body ? await new Response(res.body).text() : "";

const post = () =>
	POST(
		new Request("http://localhost/api/chat/course", {
			method: "POST",
			body: JSON.stringify({
				userMessage: "Let's call the course Intro to Python.",
				mode: "chat",
			}),
		}),
	);

describe("POST /api/chat/course — node failures", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		mockGetSession.mockResolvedValue({
			user: { id: instructor.id, role: "INSTRUCTOR" },
		});
		mockCheckTopicRelevance.mockResolvedValue({
			onTopic: true,
			reason: "course design",
		});
		mockGetOrCreate.mockResolvedValue({ id: "gen-1", step: "BASIC" });
	});

	/** The route consumes runChat's result with `for await`, so failing on the
	 * first `next()` is exactly how a node error surfaces mid-stream. */
	const throwFrom = (error: Error) => {
		mockRunChat.mockImplementation(async () => ({
			[Symbol.asyncIterator]: () => ({
				next: () => Promise.reject(error),
			}),
		}));
	};

	it("reports a retryable node failure as retryable, with try-again copy", async () => {
		throwFrom(
			new RetryableNodeError(
				'[courseAI.graph] node "chat_response" failed',
				"SERVICE_UNAVAILABLE",
				new Error("upstream boom"),
			),
		);

		const body = await readSse(await post());

		expect(body).toContain('"type":"error"');
		expect(body).toContain('"retryable":true');
		expect(body).toContain("try again");
	});

	it("reports a fatal node failure as non-retryable", async () => {
		throwFrom(
			new FatalNodeError(
				'[courseAI.graph] node "validate" failed',
				"INTERNAL_SERVER_ERROR",
				new TypeError("x is not a function"),
			),
		);

		const body = await readSse(await post());

		expect(body).toContain('"retryable":false');
		expect(body).toContain("Failed to generate AI response");
	});

	it("leaks no node name, provider message, or stack to the client", async () => {
		throwFrom(
			new RetryableNodeError(
				'[courseAI.graph] node "chat_response" failed',
				"SERVICE_UNAVAILABLE",
				new Error("upstream boom"),
			),
		);

		const body = await readSse(await post());

		expect(body).not.toContain("chat_response");
		expect(body).not.toContain("upstream boom");
		expect(body).not.toContain("courseAI.graph");
	});
});
