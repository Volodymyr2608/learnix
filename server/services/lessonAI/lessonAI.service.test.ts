import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";
import { aiMetricsHandler } from "@/server/services/_shared/aiMetrics/handler";
import {
	CheckAlreadyPendingError,
	CheckBudgetSpentError,
} from "@/server/services/conceptCheck/conceptCheck.errors";
import { findKeyPaths } from "@/test/deepKeys";

const {
	mockSaveMessage,
	mockGetContextMessages,
	mockFindByLessonId,
	mockStreamEvents,
	mockValidateReply,
	mockLogSecurityEvent,
	mockMarkContextIneligible,
	mockIssue,
	mockOnAgentCreated,
	mockLoggerWarn,
} = vi.hoisted(() => ({
	mockLoggerWarn: vi.fn(),
	mockSaveMessage: vi.fn().mockResolvedValue({}),
	mockGetContextMessages: vi.fn().mockResolvedValue([]),
	mockFindByLessonId: vi.fn().mockResolvedValue(null),
	mockStreamEvents: vi.fn(),
	mockValidateReply: vi.fn(),
	mockLogSecurityEvent: vi.fn(),
	mockMarkContextIneligible: vi.fn().mockResolvedValue(undefined),
	mockIssue: vi.fn().mockResolvedValue({
		id: "check-1",
		lessonId: "lesson-1",
		concept: "Recursion",
		question: "Which call ends a recursive descent?",
		options: ["A frame", "The base case", "An input", "A recursive call"],
		expiresAt: new Date(),
	}),
	// The turn state createLessonAgent was handed. The agent is mocked, so the
	// authoring tool never actually runs — this is how a test says "the model
	// called ask_concept_check on this turn".
	mockOnAgentCreated: vi.fn(),
}));

vi.mock("./validateReply", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./validateReply")>();
	mockValidateReply.mockImplementation(actual.validateReply);
	return { validateReply: mockValidateReply };
});
vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));
vi.mock("@/server/utils/logger", () => ({
	logger: {
		warn: mockLoggerWarn,
		error: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock("@/server/repositories/lessonAssistant.repository", () => ({
	lessonAssistantRepository: {
		saveMessage: mockSaveMessage,
		getContextMessages: mockGetContextMessages,
		markContextIneligible: mockMarkContextIneligible,
	},
}));
vi.mock("@/server/repositories/lessonInsights.repository", () => ({
	lessonInsightsRepository: { findByLessonId: mockFindByLessonId },
}));
vi.mock("@/server/services/conceptCheck/conceptCheck.service", () => ({
	conceptCheckService: { issue: mockIssue },
}));
vi.mock("./lessonAI.agent", async (importOriginal) => ({
	...(await importOriginal<object>()),
	createLessonAgent: (params: { turn: unknown }) => {
		mockOnAgentCreated(params.turn);
		return { streamEvents: mockStreamEvents };
	},
}));
// OpenAIEmbeddings is pulled in transitively via the agent's RAG tools.
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

const { lessonAIService } = await import("./lessonAI.service");

const tokenEvent = (value: string) => ({
	event: "on_chat_model_stream",
	metadata: { langgraph_node: "model_request" },
	data: { chunk: { content: value } },
});

const streamOf = (events: unknown[]) =>
	(async function* () {
		for (const event of events) yield event;
	})();

/**
 * The service persists both turns, so "was the reply persisted?" has to name the
 * role — otherwise the user turn (always written) masks the assistant turn these
 * assertions are actually about.
 */
const assistantSaves = () =>
	mockSaveMessage.mock.calls.filter(
		(call) => (call[2] as { role?: string })?.role === "assistant",
	);

const collect = async (events: unknown[]) => {
	mockStreamEvents.mockReturnValue(streamOf(events));
	const out: { type: string; message?: string; value?: string }[] = [];
	for await (const event of lessonAIService.streamResponse({
		metrics: aiMetricsHandler({ feature: "lessonAI" }),
		lessonId: "lesson-1",
		lessonTitle: "Recursion",
		courseTitle: "Algorithms",
		courseId: "course-1",
		studentId: "student-1",
		userMessage: "explain the base case",
	})) {
		out.push(event as { type: string });
	}
	return out;
};

/**
 * Consumes the turn **exactly the way `app/api/chat/lesson/route.ts` does**: it
 * checks the signal after each delivered event and `break`s.
 *
 * That `break` is the whole point. It calls `generator.return()`, which unwinds
 * `streamResponse` from its suspended `yield` and skips every statement inside
 * the streaming loop — including the loop's own abort check. The route always
 * reaches its check first, so in production the in-loop check is unreachable and
 * only a `finally` survives.
 *
 * A helper that merely collects events drives the generator to that unreachable
 * check and passes for a reason production never exercises. Abort behaviour is
 * therefore pinned through this shape, not that one.
 *
 * `abortAfter` counts delivered events, so a test can let tokens accumulate
 * before the client hangs up.
 */
const collectAborted = async (events: unknown[], abortAfter = 1) => {
	const controller = new AbortController();
	mockStreamEvents.mockReturnValue(streamOf(events));
	const out: { type: string }[] = [];
	let delivered = 0;
	for await (const event of lessonAIService.streamResponse({
		metrics: aiMetricsHandler({ feature: "lessonAI" }),
		lessonId: "lesson-1",
		lessonTitle: "Recursion",
		courseTitle: "Algorithms",
		courseId: "course-1",
		studentId: "student-1",
		userMessage: "explain the base case",
		signal: controller.signal,
	})) {
		out.push(event as { type: string });
		if (++delivered >= abortAfter) {
			controller.abort();
			break;
		}
	}
	return out;
};

/**
 * The other half of the pair: the service notices the abort itself, because the
 * consumer is still iterating when the next stream event arrives. Reachable when
 * the client disconnects while the model is mid-thought rather than between
 * tokens. Kept as one explicit case so the in-loop check stays pinned too.
 */
const collectServiceNoticedAbort = async (events: unknown[]) => {
	const controller = new AbortController();
	mockStreamEvents.mockReturnValue(
		(async function* () {
			for (const event of events) yield event;
			controller.abort();
			yield tokenEvent("");
		})(),
	);
	const out: { type: string }[] = [];
	for await (const event of lessonAIService.streamResponse({
		metrics: aiMetricsHandler({ feature: "lessonAI" }),
		lessonId: "lesson-1",
		lessonTitle: "Recursion",
		courseTitle: "Algorithms",
		courseId: "course-1",
		studentId: "student-1",
		userMessage: "explain the base case",
		signal: controller.signal,
	})) {
		out.push(event as { type: string });
	}
	return out;
};

describe("streamResponse output boundary", () => {
	beforeEach(() => {
		mockSaveMessage.mockClear();
		mockLogSecurityEvent.mockClear();
	});

	// Fail-closed: the spec says "the validator throwing counts as a rejection".
	// Without this test, someone adding a try/catch inside validateReply turns
	// the boundary fail-open with every other test still green.
	it("treats a throwing validator as a rejection", async () => {
		mockValidateReply.mockImplementationOnce(() => {
			throw new Error("boom");
		});

		const events = await collect([tokenEvent("A base case stops recursion.")]);

		const retract = events.find((e) => e.type === "retract");
		expect(retract?.message).toBe(NEUTRAL_REFUSAL_MESSAGE);
		expect(assistantSaves()).toHaveLength(0);
		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				layer: "output_validation",
				outcome: "output_validation_failed",
				ruleIds: ["validator_error"],
			}),
		);
	});

	it("persists a clean reply exactly once and never retracts", async () => {
		const events = await collect([
			tokenEvent("A base case stops the recursion."),
		]);

		expect(events.map((e) => e.type)).not.toContain("retract");
		expect(assistantSaves()).toHaveLength(1);
	});

	it("retracts and persists nothing when the reply leaks the system prompt", async () => {
		const events = await collect([
			tokenEvent("Sure — Tool usage rules (follow in order): "),
		]);

		const retract = events.find((e) => e.type === "retract");
		expect(retract?.message).toBe(NEUTRAL_REFUSAL_MESSAGE);
		expect(assistantSaves()).toHaveLength(0);
	});

	it("captures tool output as a bare string for the verbatim check", async () => {
		const chunk =
			"Recursion terminates at the base case, which is the smallest input the function can answer directly without calling itself again.";
		const events = await collect([
			{
				event: "on_tool_end",
				name: "retrieve_lesson_context",
				data: { output: chunk },
			},
			tokenEvent(chunk),
		]);

		expect(events.some((e) => e.type === "retract")).toBe(true);
		expect(assistantSaves()).toHaveLength(0);
	});

	it("captures tool output wrapped in a ToolMessage for the verbatim check", async () => {
		const chunk =
			"Recursion terminates at the base case, which is the smallest input the function can answer directly without calling itself again.";
		const events = await collect([
			{
				event: "on_tool_end",
				name: "retrieve_lesson_context",
				data: { output: { content: chunk } },
			},
			tokenEvent(chunk),
		]);

		expect(events.some((e) => e.type === "retract")).toBe(true);
	});

	// The five `mastery_write_retained` cases that stood here were retired with
	// the outcome itself. The correlation they measured — a mastery write
	// committed on a turn whose reply was then retracted — cannot occur any more:
	// the write moved to its own request (the answer mutation), and the only
	// artifact a turn produces is committed after the boundary passes. A
	// zero-baseline metric left reading zero because its subject moved looks like
	// evidence of safety, so it was removed rather than kept. See spec.md item 10.
});

describe("streamResponse turn persistence", () => {
	beforeEach(() => {
		mockSaveMessage.mockClear().mockResolvedValue({ id: "user-row-1" });
		mockGetContextMessages.mockClear().mockResolvedValue([]);
	});

	it("persists the user turn itself", async () => {
		await collect([tokenEvent("A base case stops the recursion.")]);

		expect(mockSaveMessage).toHaveBeenCalledWith("lesson-1", "student-1", {
			role: "user",
			content: "explain the base case",
		});
	});

	// The duplication bug: saving before the context read puts this turn in its
	// own replayed history, and streamResponse appends it again as the current
	// message. Order is the fix, so order is what the test pins.
	// One tutor request is not one model call: L2, the router pass, each tool, then
	// the answer. Leaving the ceiling to LangGraph's default makes the per-request
	// cost an accident rather than a decision.
	it("declares an explicit recursion limit on the agent stream", async () => {
		await collect([tokenEvent("A base case stops the recursion.")]);

		expect(mockStreamEvents).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ recursionLimit: 12 }),
		);
	});

	it("reads model context before persisting the current turn", async () => {
		await collect([tokenEvent("A base case stops the recursion.")]);

		const readOrder = mockGetContextMessages.mock.invocationCallOrder[0];
		const writeOrder = mockSaveMessage.mock.invocationCallOrder[0];
		expect(readOrder).toBeLessThan(writeOrder as number);
	});
});

// F3: contextEligible was applied to turns the INPUT guard rejected. An output
// rejection is the stronger adversarial signal of the two, and leaving the
// eliciting prompt eligible let a payload be re-sent with its previous attempt
// sitting in context as ordinary conversation — a fresh sample of a stochastic
// model on every retry.
describe("rejected replies do not return as context", () => {
	beforeEach(() => {
		mockSaveMessage.mockClear().mockResolvedValue({ id: "user-row-1" });
		mockMarkContextIneligible.mockClear();
	});

	it("flips the eliciting user turn when the reply is rejected", async () => {
		await collect([tokenEvent("Sure — Tool usage rules (follow in order): ")]);

		expect(mockMarkContextIneligible).toHaveBeenCalledWith(
			"user-row-1",
			"lesson-1",
			"student-1",
		);
	});

	it("leaves the user turn eligible when the reply is clean", async () => {
		await collect([tokenEvent("A base case stops the recursion.")]);

		expect(mockMarkContextIneligible).not.toHaveBeenCalled();
	});

	it("flips the user turn on an aborted, rejected turn too", async () => {
		await collectAborted([
			tokenEvent("Sure — Tool usage rules (follow in order): "),
		]);

		expect(mockMarkContextIneligible).toHaveBeenCalledWith(
			"user-row-1",
			"lesson-1",
			"student-1",
		);
	});
});

// F1: validateReply ran only after normal completion, so a client that
// disconnected after the last content token got the whole reply and produced no
// security event at all. security.md S13 §2 accepts the streaming disclosure on
// the strength of that event staying queryable — so it must not be something the
// adversary can switch off.
describe("streamResponse abort path", () => {
	beforeEach(() => {
		mockSaveMessage.mockClear().mockResolvedValue({ id: "user-row-1" });
		mockLogSecurityEvent.mockClear();
	});

	it("still emits output_validation_failed when the client aborts", async () => {
		await collectAborted([
			tokenEvent("Sure — Tool usage rules (follow in order): "),
		]);

		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				layer: "output_validation",
				outcome: "output_validation_failed",
				ruleIds: ["system_prompt_echo"],
			}),
		);
	});

	it("persists no assistant row on abort, clean reply or not", async () => {
		await collectAborted([tokenEvent("A base case stops the recursion.")]);

		expect(assistantSaves()).toHaveLength(0);
	});

	it("emits nothing on a clean aborted reply", async () => {
		await collectAborted([tokenEvent("A base case stops the recursion.")]);

		expect(mockLogSecurityEvent).not.toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "output_validation_failed" }),
		);
	});

	// Nothing was delivered, so the route never gets to break — this abort can only
	// be the one the service notices itself, and it must stay silent.
	it("emits nothing when aborted before any content token", async () => {
		await collectServiceNoticedAbort([
			{ event: "on_tool_start", name: "retrieve_lesson_context", data: {} },
		]);

		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});

	// The in-loop check is unreachable from the route, but not dead: it fires when
	// the client disconnects while the model is mid-thought rather than between
	// tokens. Pinned separately so removing it stays a deliberate act.
	it("also runs the boundary when the service notices the abort first", async () => {
		await collectServiceNoticedAbort([
			tokenEvent("Sure — Tool usage rules (follow in order): "),
		]);

		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "output_validation_failed" }),
		);
	});

	// Tokens accumulate across several delivered events before the client hangs up
	// — the reply is only adversarial once assembled, so the boundary has to see
	// the whole of what reached the browser, not just the last frame.
	it("validates everything delivered, not only the final frame", async () => {
		await collectAborted(
			[
				tokenEvent("Sure — "),
				tokenEvent("Tool usage rules (follow in order): "),
			],
			2,
		);

		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ ruleIds: ["system_prompt_echo"] }),
		);
	});

	// An abort landing after the last stream event never reaches the in-loop check
	// and the consumer never breaks, so only the post-loop guard catches it.
	it("persists no assistant row when the abort lands after the last event", async () => {
		const controller = new AbortController();
		mockStreamEvents.mockReturnValue(
			streamOf([tokenEvent("A base case stops the recursion.")]),
		);

		for await (const _event of lessonAIService.streamResponse({
			metrics: aiMetricsHandler({ feature: "lessonAI" }),
			lessonId: "lesson-1",
			lessonTitle: "Recursion",
			courseTitle: "Algorithms",
			courseId: "course-1",
			studentId: "student-1",
			userMessage: "explain the base case",
			signal: controller.signal,
		})) {
			controller.abort();
		}

		expect(assistantSaves()).toHaveLength(0);
	});

	it("runs the boundary at most once per turn", async () => {
		await collectAborted([
			tokenEvent("Sure — Tool usage rules (follow in order): "),
		]);

		const failures = mockLogSecurityEvent.mock.calls.filter(
			(call) =>
				(call[0] as { outcome?: string }).outcome ===
				"output_validation_failed",
		);
		expect(failures).toHaveLength(1);
	});
});

// The third exit named in the spec's Agent notes: a provider error mid-stream
// leaves a partial reply in the browser exactly as an abort does.
describe("streamResponse mid-stream error path", () => {
	beforeEach(() => {
		mockSaveMessage.mockClear().mockResolvedValue({ id: "user-row-1" });
		mockLogSecurityEvent.mockClear();
		mockMarkContextIneligible.mockClear().mockResolvedValue(undefined);
	});

	const collectFailing = async () => {
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("Sure — Tool usage rules (follow in order): ");
				throw new Error("provider exploded");
			})(),
		);
		const out: { type: string }[] = [];
		for await (const event of lessonAIService.streamResponse({
			metrics: aiMetricsHandler({ feature: "lessonAI" }),
			lessonId: "lesson-1",
			lessonTitle: "Recursion",
			courseTitle: "Algorithms",
			courseId: "course-1",
			studentId: "student-1",
			userMessage: "explain the base case",
		})) {
			out.push(event as { type: string });
		}
		return out;
	};

	it("validates the partial reply, persists nothing, and yields the neutral error", async () => {
		const events = await collectFailing();

		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "output_validation_failed" }),
		);
		expect(assistantSaves()).toHaveLength(0);
		expect(events.at(-1)).toEqual({
			type: "error",
			message: "Something went wrong",
		});
	});

	// The write is bookkeeping. Letting it abort the turn would take the security
	// event and the refusal down with it — the same "control the adversary can
	// decline to trigger" this branch exists to remove. clearHistory is callable
	// mid-stream, so the row really can vanish underneath this.
	it("still emits and still refuses when the context flip fails", async () => {
		mockMarkContextIneligible.mockRejectedValueOnce(new Error("P2025"));

		const events = await collectFailing();

		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "output_validation_failed" }),
		);
		expect(events.at(-1)).toEqual({
			type: "error",
			message: "Something went wrong",
		});
	});
});

describe("what a persisted tool call may carry", () => {
	beforeEach(() => {
		mockSaveMessage.mockClear().mockResolvedValue({ id: "user-row-1" });
		mockGetContextMessages.mockClear().mockResolvedValue([]);
	});

	const toolStart = (name: string, input: Record<string, unknown>) => ({
		event: "on_tool_start",
		name,
		data: { input },
	});

	const persistedCalls = () => {
		const save = assistantSaves()[0];
		return ((save?.[2] as { toolCalls?: { tool: string }[] })?.toolCalls ??
			[]) as Record<string, unknown>[];
	};

	/**
	 * `ask_concept_check`'s arguments include `correctOption` — the answer key —
	 * and `toolCalls` is a durable column. Redacting that one field by name would
	 * work today and break silently on a rename, or on the next tool that carries
	 * a secret. Default-deny is what makes the whole class unrepresentable.
	 */
	it("persists nothing from a tool that declares no safe fields", async () => {
		await collect([
			toolStart("ask_concept_check", {
				concept: "Recursion",
				question: "Which call ends a recursive descent?",
				options: ["The base case", "A recursive call"],
				correctOption: "The base case",
			}),
			tokenEvent("Let me check your understanding."),
		]);

		expect(persistedCalls()).toEqual([{ tool: "ask_concept_check" }]);
	});

	it("persists nothing from a tool nobody has classified", async () => {
		await collect([
			toolStart("some_tool_added_later", { secret: "value" }),
			tokenEvent("A base case stops the recursion."),
		]);

		expect(persistedCalls()).toEqual([{ tool: "some_tool_added_later" }]);
	});

	it("keeps the declared fields of a tool that has them", async () => {
		await collect([
			toolStart("retrieve_lesson_context", { query: "base case", k: 4 }),
			tokenEvent("A base case stops the recursion."),
		]);

		expect(persistedCalls()).toEqual([
			{ tool: "retrieve_lesson_context", query: "base case" },
		]);
	});

	it("never lets a persisted entry carry a key outside its declaration", async () => {
		await collect([
			toolStart("retrieve_lesson_context", {
				query: "base case",
				correctOption: "smuggled",
			}),
			tokenEvent("A base case stops the recursion."),
		]);

		for (const call of persistedCalls()) {
			expect(Object.keys(call).sort()).toEqual(["query", "tool"]);
		}
	});
});

describe("an authored check is committed only after the boundary passes", () => {
	const authored = {
		concept: "Recursion",
		question: "Which call ends a recursive descent?",
		options: ["The base case", "A recursive call", "A frame", "An input"],
		correctOption: "The base case",
	};

	beforeEach(() => {
		mockSaveMessage.mockClear().mockResolvedValue({ id: "user-row-1" });
		mockGetContextMessages.mockClear().mockResolvedValue([]);
		mockIssue.mockClear();
		// Stands in for the tool having run. The agent is mocked, so this is how
		// a test says "the model authored a check on this turn".
		mockOnAgentCreated.mockImplementation((turn: { pendingCheck: unknown }) => {
			turn.pendingCheck = {
				studentId: "student-1",
				lessonId: "lesson-1",
				...authored,
			};
		});
	});

	it("issues the check on a clean turn and streams it without its answer", async () => {
		const events = await collect([
			tokenEvent("Let me ask you something about it."),
		]);

		expect(mockIssue).toHaveBeenCalledTimes(1);
		const frame = events.find((e) => e.type === "concept_check");
		expect(frame).toBeDefined();
		expect(findKeyPaths(frame, "correct")).toEqual([]);
	});

	it("issues nothing when the reply is retracted", async () => {
		const events = await collect([
			tokenEvent("Sure — Tool usage rules (follow in order): "),
		]);

		expect(events.some((e) => e.type === "retract")).toBe(true);
		expect(mockIssue).not.toHaveBeenCalled();
	});

	it("issues nothing when the turn is aborted", async () => {
		await collectAborted([tokenEvent("Let me ask you something about it.")]);

		expect(mockIssue).not.toHaveBeenCalled();
	});

	it("issues nothing when the stream errors mid-turn", async () => {
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("Let me ask you ");
				throw new Error("provider exploded");
			})(),
		);

		const out = [];
		for await (const event of lessonAIService.streamResponse({
			metrics: aiMetricsHandler({ feature: "lessonAI" }),
			lessonId: "lesson-1",
			lessonTitle: "Recursion",
			courseTitle: "Intro",
			studentId: "student-1",
			courseId: "course-1",
			userMessage: "explain the base case",
		})) {
			out.push(event);
		}

		expect(out.some((e) => e.type === "error")).toBe(true);
		expect(mockIssue).not.toHaveBeenCalled();
	});

	it("discards the check when the reply gave its answer away", async () => {
		await collect([tokenEvent("Remember that the base case is what ends it.")]);

		expect(mockIssue).not.toHaveBeenCalled();
	});

	it("still delivers the reply when issuing the check fails", async () => {
		mockIssue.mockRejectedValueOnce(new Error("already pending"));

		const events = await collect([
			tokenEvent("Let me ask you something about it."),
		]);

		expect(events.some((e) => e.type === "retract")).toBe(false);
		expect(assistantSaves()).toHaveLength(1);
	});

	/**
	 * `tool_call_declined` is documented as covering "no concepts on the lesson
	 * yet, a check already open, a budget spent" — and two of those three are
	 * raised inside `issue()`, which runs after the output boundary, where the
	 * only record was an unstructured warn line. The routine-denial baseline S11
	 * reads was therefore missing two of its three sources: a cohort that has
	 * exhausted its budget looked exactly like a feature that works.
	 */
	const issueFailures: [string, Error, string][] = [
		[
			"a question already waiting",
			new CheckAlreadyPendingError("waiting"),
			"check_already_pending",
		],
		[
			"a spent budget",
			new CheckBudgetSpentError("spent"),
			"check_budget_spent",
		],
		["anything else", new Error("boom"), "check_issue_failed"],
	];

	it.each(
		issueFailures,
	)("reports a check that could not be issued: %s", async (_label, error, ruleId) => {
		mockIssue.mockRejectedValueOnce(error);
		mockLogSecurityEvent.mockClear();

		await collect([tokenEvent("Let me ask you something about it.")]);

		const declines = mockLogSecurityEvent.mock.calls
			.map((call) => call[0] as { outcome: string; ruleIds: string[] })
			.filter((event) => event.outcome === "tool_call_declined");
		expect(declines).toHaveLength(1);
		expect(declines[0]?.ruleIds).toEqual([ruleId]);
	});

	// The one place a Prisma validation error could render the authored question
	// and its answer key into a log line.
	it("names the failure without quoting anything the model wrote", async () => {
		mockIssue.mockRejectedValueOnce(
			new Error('Invalid value for correct: "The base case"'),
		);

		await collect([tokenEvent("Let me ask you something about it.")]);

		const logged = JSON.stringify(mockLoggerWarn.mock.calls);
		expect(logged).not.toContain("The base case");
	});
});
