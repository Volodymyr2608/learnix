# AI Tutor Guardrails — Bypass Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) scope items **7–11** and their acceptance
> criteria, [`../security.md`](../security.md), and
> [`docs/security/2026-08-16-ai-tutor-independent-review.md`](../../../../security/2026-08-16-ai-tutor-independent-review.md)
> for the findings (F1–F7) this closes.
>
> The shipped [`plan.md`](./plan.md) in this folder is the record of the **original** build. Do not
> edit it. This file is the reopened work.

**Goal:** Close the seven ways an adversary can take a path where the tutor's existing guard and
telemetry controls do not run — without changing what a legitimate student sees.

**Architecture:** Every finding is the same shape: a boundary with an un-instrumented bypass around
it. So most tasks converge the *exits* of one function (`lessonAIService.streamResponse`) onto one
shared output-boundary call, rather than adding new boundaries. Task 1 is a pure refactor that makes
Tasks 2 and 3 small; Tasks 5–8 are independent one-file changes; Task 9 is the Gate-Docs pass.

**Tech Stack:** TypeScript · LangChain `@langchain/core` 1.1.45 / `langchain` 1.4.0 ·
`@langchain/langgraph` 1.3.0 · Prisma · Vitest.

**Codebase anchors (verified during planning):**

- `LessonAIService.streamResponse` (`server/services/lessonAI/lessonAI.service.ts:30-196`) — async
  generator; loads history + insights in parallel (`:50-53`), accumulates `fullReply` (`:114-117`),
  `retrievedContent` (`:127-129`) and `masteryCommitted` (`:131-138`); three exits: abort return
  (`:104`), catch (`:141-145`), normal completion (`:147-195`).
- `validateReply` (`server/services/lessonAI/validateReply.ts:134-146`) — **emits its own**
  `output_validation_failed` via `reject()` (`:114-127`). Do not log it a second time.
- `lessonAssistantRepository` (`server/repositories/lessonAssistant.repository.ts`) —
  `getContextMessages` (`:33-55`, newest-first `take` then `.reverse()`), `saveMessage` (`:57-80`,
  returns the created row), `MODEL_CONTEXT_MESSAGE_LIMIT = 20` (`:9`).
- `POST /api/chat/lesson` (`app/api/chat/lesson/route.ts`) — persists the **user** turn at `:131-134`
  before opening the stream; persists nothing on `guard_blocked` (`:107-112`); persists both rows
  with `contextEligible: false` on `off_topic` (`:114-129`).
- `guardUserInput` (`server/services/_shared/aiGuard/guardUserInput.ts:64-97`) — the `catch` that
  fails open and emits `fallback_triggered` with `ruleIds: ["l2_unavailable"]`.
- `checkTopicRelevance` (`server/services/_shared/aiGuard/topicRelevance.ts:40-54`) — `ChatOpenAI`
  built per call, no `timeout`, no `maxRetries`.
- `buildMarkConceptUnderstoodTool` (`server/services/lessonAI/tools/markConceptUnderstood.tool.ts`) —
  returns a prose string on both the denial (`:20`) and the commit (`:29`) paths.
- `checkAiRateLimit` (`server/utils/aiRateLimiter.ts:8-28`) — keyed on `userId` only; called by
  `app/api/chat/lesson/route.ts:26`, `app/api/chat/course/route.ts:33`,
  `app/api/chat/learning-path/route.ts:19`.
- `LessonAssistantMessage.contextEligible` (`prisma/schema/lessonAssistant.prisma`) — `Boolean
  @default(true)`; the column already exists, **no migration is needed in this plan**.
- Unit-test patterns (`server/services/lessonAI/lessonAI.service.test.ts`) — `vi.hoisted` mock bag,
  `collect()` helper (`:68-82`), `tokenEvent()` (`:57-61`), `streamOf()` (`:63-66`),
  `markConceptEnd()` (`:168-172`). Reuse these; do not invent a second harness.
- Integration-test patterns (`app/api/chat/lesson/route.historyBoundary.integration.test.ts`) —
  factories from `@/test/factories`, `mockGetSession`, real DB.
- `content_and_artifact` tool response format — confirmed present in the installed
  `@langchain/core@1.1.45` (`node_modules/@langchain/core/dist/tools/types.d.ts`).

**Per-task conventions:** after the implement step, `pnpm typecheck` and `pnpm check` must be clean
before committing. Unit tests are colocated `*.test.ts`; integration tests `*.integration.test.ts`
(require the `learnix_test` DB). Services and repositories export singletons. No task changes a
prompt, so **no eval run is required** — Task 9 states this explicitly for the PR.

---

## Task 1: Move the user-turn save into the service (and stop replaying the current turn)

Enabler for Tasks 2 and 3, and a bug fix in its own right.

`route.ts:131-134` saves the user message **before** `streamResponse` runs, and `streamResponse`
then calls `getContextMessages` (`:51`), which returns the 20 newest eligible rows — including the
row just written. The same text is then appended again as the current turn (`:85`). **The current
message is in the model's context twice.** `courseAI` already avoids exactly this
(`app/api/chat/course/route.ts` saves in its `finally`, with a comment explaining why); the tutor
does not.

Moving the save into the service, positioned *after* the context read, fixes the duplication and
gives Task 3 the row id it needs.

**Files:**
- Modify: `server/services/lessonAI/lessonAI.service.ts:49-69`
- Modify: `app/api/chat/lesson/route.ts:131-134` (delete)
- Test: `server/services/lessonAI/lessonAI.service.test.ts`
- Test: `app/api/chat/lesson/route.historyBoundary.integration.test.ts` (assertion moves)

- [x] **Step 1: Write the failing test**

Add to `lessonAI.service.test.ts`, inside a new `describe`:

```ts
describe("streamResponse turn persistence", () => {
	beforeEach(() => {
		mockSaveMessage.mockClear();
		mockGetContextMessages.mockClear();
		mockSaveMessage.mockResolvedValue({ id: "user-row-1" });
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
	it("reads model context before persisting the current turn", async () => {
		await collect([tokenEvent("A base case stops the recursion.")]);

		const readOrder = mockGetContextMessages.mock.invocationCallOrder[0];
		const writeOrder = mockSaveMessage.mock.invocationCallOrder[0];
		expect(readOrder).toBeLessThan(writeOrder);
	});
});
```

- [x] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run server/services/lessonAI/lessonAI.service.test.ts`
Expected: FAIL — `expected "saveMessage" to be called with ... role: "user"`; the service currently
only saves the assistant turn.

- [x] **Step 3: Implement minimally**

In `lessonAI.service.ts`, replace lines 49-53 with:

```ts
		// Load conversation history and lesson concept list in parallel
		const [history, lessonInsights] = await Promise.all([
			lessonAssistantRepository.getContextMessages(lessonId, studentId),
			lessonInsightsRepository.findByLessonId(lessonId),
		]);

		// Persist the user turn AFTER the context read, not before. getContextMessages
		// returns the newest eligible rows, so saving first puts this very turn into
		// its own replayed history — and it is appended again below as the current
		// message. courseAI's route carries the same note for the same reason.
		const userRow = await lessonAssistantRepository.saveMessage(
			lessonId,
			studentId,
			{ role: "user", content: userMessage },
		);
```

`userRow` is unused until Task 3; add `void userRow;` **only if** `pnpm check` flags it — Biome's
`noUnusedVariables` applies to locals. Prefer completing Task 3 in the same session so the variable
is consumed.

In `app/api/chat/lesson/route.ts`, delete lines 131-134 entirely:

```ts
	await lessonAssistantRepository.saveMessage(lessonId, session.user.id, {
		role: "user",
		content: message,
	});
```

The `lessonAssistantRepository` import stays — the off-topic branch still uses it.

- [x] **Step 4: Fix the integration assertion that depended on the old location**

`route.historyBoundary.integration.test.ts` mocks `lessonAIService.streamResponse`, so with the save
moved into the service the allow-path user row is no longer written during that test. Replace the
final assertion:

```ts
		// The boundary: it is not what the model sees on turn 2.
		expect(context.map((m) => m.content)).not.toContain(PAYLOAD);
```

and delete the line below it (`expect(context.map((m) => m.content)).toContain("Explain recursion");`)
— that behaviour is now owned by the service and is covered by the unit test added in Step 1. Add a
comment so the deletion is not read as a lost assertion:

```ts
		// The allow-path user row is persisted by lessonAIService.streamResponse
		// (mocked here); its ordering vs. the context read is pinned in
		// lessonAI.service.test.ts, not in this route test.
```

- [x] **Step 5: Run both, expect PASS** — and `pnpm typecheck` + `pnpm check` clean.

Run: `pnpm vitest run server/services/lessonAI/lessonAI.service.test.ts`
Run: `pnpm vitest run app/api/chat/lesson/route.historyBoundary.integration.test.ts`

- [x] **Step 6: Commit**

```bash
git commit -m "refactor(lessonAI): own the user turn in the service, after the context read"
```

---

## Task 2: Validate the reply on the abort and mid-stream-error exits (F1)

**Files:**
- Modify: `server/services/lessonAI/lessonAI.service.ts:100-195`
- Test: `server/services/lessonAI/lessonAI.service.test.ts`

- [x] **Step 1: Write the failing test**

`collect()` does not pass a signal, so add a variant next to it:

```ts
const collectAborted = async (events: unknown[], abortAfter: number) => {
	const controller = new AbortController();
	let seen = 0;
	mockStreamEvents.mockReturnValue(
		(async function* () {
			for (const event of events) {
				yield event;
				if (++seen >= abortAfter) controller.abort();
			}
		})(),
	);
	const out: { type: string }[] = [];
	for await (const event of lessonAIService.streamResponse({
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
```

Then the cases:

```ts
describe("streamResponse abort path", () => {
	beforeEach(() => {
		mockSaveMessage.mockClear().mockResolvedValue({ id: "user-row-1" });
		mockLogSecurityEvent.mockClear();
	});

	it("still emits output_validation_failed when the client aborts", async () => {
		await collectAborted(
			[tokenEvent("Sure — Tool usage rules (follow in order): ")],
			1,
		);

		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				layer: "output_validation",
				outcome: "output_validation_failed",
				ruleIds: ["system_prompt_echo"],
			}),
		);
	});

	it("persists no assistant row on abort, clean reply or not", async () => {
		await collectAborted([tokenEvent("A base case stops the recursion.")], 1);

		expect(mockSaveMessage).not.toHaveBeenCalledWith(
			"lesson-1",
			"student-1",
			expect.objectContaining({ role: "assistant" }),
		);
	});

	it("emits nothing on a clean aborted reply", async () => {
		await collectAborted([tokenEvent("A base case stops the recursion.")], 1);

		expect(mockLogSecurityEvent).not.toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "output_validation_failed" }),
		);
	});

	it("emits nothing when aborted before any content token", async () => {
		await collectAborted(
			[{ event: "on_tool_start", name: "retrieve_lesson_context", data: {} }],
			1,
		);

		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});

	it("still correlates a retained mastery write on an aborted, rejected turn", async () => {
		await collectAborted(
			[
				markConceptEnd(recorded),
				tokenEvent("Sure — Tool usage rules (follow in order): "),
			],
			2,
		);

		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "mastery_write_retained" }),
		);
	});
});
```

`recorded` and `markConceptEnd` are defined in the existing `describe`; hoist both to module scope
(just below `collect`) so both blocks can use them. That is a move, not a rewrite.

- [x] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run server/services/lessonAI/lessonAI.service.test.ts -t "abort path"`
Expected: FAIL — `output_validation_failed` is never emitted; `streamResponse` returns at `:104`
before validation.

- [x] **Step 3: Implement minimally**

In `lessonAI.service.ts`, add these two helpers immediately after `masteryCommitted` is declared
(after `:98`):

```ts
		// The output boundary, callable from every exit. validateReply emits its own
		// output_validation_failed via reject(), so this must not log that outcome a
		// second time — it only handles the validator throwing.
		const runOutputBoundary = (): ReplyValidationResult => {
			try {
				return validateReply(fullReply, { userId: studentId, retrievedContent });
			} catch {
				logSecurityEvent({
					feature: "lessonAI",
					userId: studentId,
					layer: "output_validation",
					outcome: "output_validation_failed",
					ruleIds: ["validator_error"],
					score: 0,
				});
				return { valid: false, ruleId: "validator_error" };
			}
		};

		// Shared by the abort and mid-stream-error exits: the client is gone or the
		// turn failed, so there is nothing to retract and nothing to persist — but a
		// reply that reached the browser must still produce its security events.
		// Without this, disconnecting after the last token is a detection bypass
		// (review F1), and S13 §2 accepts the streaming disclosure on the strength
		// of output_validation_failed staying queryable.
		const finishWithoutDelivery = () => {
			if (!fullReply) return;
			const validation = runOutputBoundary();
			if (validation.valid || !masteryCommitted) return;
			logSecurityEvent({
				feature: "lessonAI",
				userId: studentId,
				layer: "output_validation",
				outcome: "mastery_write_retained",
				ruleIds: [validation.ruleId],
				score: 0,
			});
		};
```

Add `ReplyValidationResult` to the existing type import at `:8` (it is already imported — confirm).

Replace the in-loop abort check at `:104`:

```ts
					if (signal?.aborted) {
						finishWithoutDelivery();
						return;
					}
```

Replace the catch block at `:141-145`:

```ts
			} catch (_error) {
				finishWithoutDelivery();
				if (signal?.aborted) return;
				yield { type: "error" as const, message: "Something went wrong" };
				return;
			}
```

Replace the normal-path validation at `:150-167` so it uses the shared helper:

```ts
			// Fail-closed. A validator that throws is a rejection, not a pass.
			const validation = runOutputBoundary();
```

(delete the inline `let validation … try/catch` block; the rest of `:169-195` is unchanged).

- [x] **Step 4: Run it, expect PASS** — and the pre-existing `output boundary` describe must stay
green (the throwing-validator test still asserts `ruleIds: ["validator_error"]`).

Run: `pnpm vitest run server/services/lessonAI/lessonAI.service.test.ts`
Expected: PASS, all cases in both describes.

- [x] **Step 5: Commit**

```bash
git commit -m "fix(lessonAI): run the output boundary on the abort and error exits"
```

---

## Task 3: A rejected reply makes its own prompt context-ineligible (F3)

**Files:**
- Modify: `server/repositories/lessonAssistant.repository.ts`
- Modify: `server/services/lessonAI/lessonAI.service.ts`
- Test: `server/services/lessonAI/lessonAI.service.test.ts`
- Test: `server/repositories/lessonAssistant.repository.integration.test.ts`

- [x] **Step 1: Write the failing tests**

Unit, in `lessonAI.service.test.ts` — add `mockMarkContextIneligible` to the `vi.hoisted` bag and to
the repository mock, then:

```ts
describe("rejected replies do not return as context", () => {
	beforeEach(() => {
		mockSaveMessage.mockClear().mockResolvedValue({ id: "user-row-1" });
		mockMarkContextIneligible.mockClear();
	});

	it("flips the eliciting user turn when the reply is rejected", async () => {
		await collect([tokenEvent("Sure — Tool usage rules (follow in order): ")]);

		expect(mockMarkContextIneligible).toHaveBeenCalledWith("user-row-1");
	});

	it("leaves the user turn eligible when the reply is clean", async () => {
		await collect([tokenEvent("A base case stops the recursion.")]);

		expect(mockMarkContextIneligible).not.toHaveBeenCalled();
	});
});
```

Integration, in `lessonAssistant.repository.integration.test.ts`:

```ts
it("markContextIneligible removes a message from the model context but not the thread", async () => {
	const saved = await lessonAssistantRepository.saveMessage(lessonId, studentId, {
		role: "user",
		content: "payload",
	});

	await lessonAssistantRepository.markContextIneligible(saved.id);

	const thread = await lessonAssistantRepository.getMessages(lessonId, studentId);
	const context = await lessonAssistantRepository.getContextMessages(lessonId, studentId);

	expect(thread.map((m) => m.content)).toContain("payload");
	expect(context.map((m) => m.content)).not.toContain("payload");
});
```

Match the existing file's setup for `lessonId` / `studentId`; read it before writing this step.

- [x] **Step 2: Run them, expect FAIL**

Run: `pnpm vitest run server/services/lessonAI/lessonAI.service.test.ts -t "return as context"`
Expected: FAIL — `mockMarkContextIneligible` is not a function / never called.

- [x] **Step 3: Implement minimally**

`lessonAssistant.repository.ts`, after `saveMessage`:

```ts
	/**
	 * Takes a message out of the model-context read while leaving it in the thread.
	 * Used when the OUTPUT boundary rejects a reply: the prompt that elicited it is
	 * the strongest adversarial signal available, and replaying it as ordinary
	 * history gives the payload a fresh sample of a stochastic model on every retry.
	 */
	async markContextIneligible(messageId: string) {
		await db.lessonAssistantMessage.update({
			where: { id: messageId },
			data: { contextEligible: false },
		});
	}
```

`lessonAI.service.ts` — in `finishWithoutDelivery`, before the mastery correlation:

```ts
			if (!validation.valid) {
				await lessonAssistantRepository.markContextIneligible(userRow.id);
			}
```

`finishWithoutDelivery` must become `async` and its two call sites `await`ed. On the normal rejection
path (`:169`), add the same call inside the existing `if (!validation.valid)` block, before the
`yield { type: "retract" }`.

- [x] **Step 4: Run them, expect PASS** — plus `pnpm typecheck`, `pnpm check`.

Run: `pnpm vitest run server/services/lessonAI/lessonAI.service.test.ts`
Run: `pnpm vitest run server/repositories/lessonAssistant.repository.integration.test.ts`

- [x] **Step 5: Commit**

```bash
git commit -m "fix(lessonAI): a rejected reply makes its own prompt context-ineligible"
```

---

## Task 4: Decide `mastery_write_retained` structurally, not by prose (F4)

**Files:**
- Modify: `server/services/lessonAI/tools/markConceptUnderstood.tool.ts`
- Modify: `server/services/lessonAI/lessonAI.service.ts:131-138`
- Test: `server/services/lessonAI/tools/markConceptUnderstood.tool.test.ts`
- Test: `server/services/lessonAI/lessonAI.service.test.ts`

- [x] **Step 1: Write the failing tests**

`markConceptUnderstood.tool.test.ts` — the tool now returns `[content, artifact]`, so `tool.invoke`
of a `content_and_artifact` tool returns a `ToolMessage`. Update the two existing assertions that
compare the result to `NEUTRAL_REFUSAL_MESSAGE` to read `result.content`, and add:

```ts
	it("marks a committed write in the artifact, not only in the prose", async () => {
		const tool = build(["Recursion"]);

		const result = await tool.invoke({ concept: "Recursion", level: 2 });

		expect(result.artifact).toEqual({
			committed: true,
			concept: "Recursion",
			level: 2,
		});
		expect(result.content).toContain("Recorded");
	});

	it("marks a denial in the artifact", async () => {
		const tool = build(["Recursion"]);

		const result = await tool.invoke({ concept: "Nope", level: 2 });

		expect(result.artifact).toEqual({ committed: false });
		expect(result.content).toBe(NEUTRAL_REFUSAL_MESSAGE);
	});
```

`lessonAI.service.test.ts` — the decisive one. Rewrite `markConceptEnd` to carry an artifact and add
a case proving the prose no longer matters:

```ts
const markConceptEnd = (artifact: Record<string, unknown>, content = "") => ({
	event: "on_tool_end",
	name: "mark_concept_understood",
	data: { output: { content, artifact } },
});

it("counts a commit from the artifact even when the prose is the refusal text", async () => {
	const events = await collect([
		markConceptEnd({ committed: true, concept: "Recursion", level: 2 }, NEUTRAL_REFUSAL_MESSAGE),
		tokenEvent("Sure — Tool usage rules (follow in order): "),
	]);

	expect(events.some((e) => e.type === "retract")).toBe(true);
	expect(mockLogSecurityEvent).toHaveBeenCalledWith(
		expect.objectContaining({ outcome: "mastery_write_retained" }),
	);
});

it("does not count a denial even when the prose looks like a commit", async () => {
	await collect([
		markConceptEnd({ committed: false }, 'Recorded: "Recursion" at level 2 (applied).'),
		tokenEvent("Sure — Tool usage rules (follow in order): "),
	]);

	expect(mockLogSecurityEvent).not.toHaveBeenCalledWith(
		expect.objectContaining({ outcome: "mastery_write_retained" }),
	);
});
```

Update the three pre-existing mastery cases to the new `markConceptEnd` signature.

- [x] **Step 2: Run them, expect FAIL**

Run: `pnpm vitest run server/services/lessonAI/tools/markConceptUnderstood.tool.test.ts`
Expected: FAIL — `result.artifact` is `undefined`; the tool returns a plain string.

- [x] **Step 3: Implement minimally**

`markConceptUnderstood.tool.ts` — return a tuple and declare the response format:

```ts
		async ({ concept, level }: { concept: string; level: number }) => {
			const authorization = authorizeMarkConceptUnderstood(
				{ concept, level },
				{ userId: studentId, lessonConcepts },
			);
			// The artifact is what telemetry reads. The prose is for the model, and
			// must never be load-bearing: mastery_write_retained has a baseline of
			// zero, so a signal that dies when a shared refusal string is reworded
			// is a permanent blind spot rather than a degraded metric (review F4).
			if (!authorization.authorized) {
				return [authorization.message, { committed: false }] as const;
			}

			await conceptMasteryRepository.upsertMastery(
				studentId,
				courseId,
				authorization.canonicalConcept,
				level,
			);
			const labels = ["unfamiliar", "exposed", "applied", "mastered"];
			return [
				`Recorded: "${authorization.canonicalConcept}" at level ${level} (${labels[level] ?? level}).`,
				{ committed: true, concept: authorization.canonicalConcept, level },
			] as const;
		},
		{
			name: "mark_concept_understood",
			responseFormat: "content_and_artifact",
			description: /* unchanged */,
			schema: /* unchanged */,
		},
```

`lessonAI.service.ts` — replace the string comparison at `:131-138`:

```ts
					if (event.name === "mark_concept_understood") {
						const artifact = (
							event.data?.output as { artifact?: { committed?: boolean } } | undefined
						)?.artifact;
						if (artifact?.committed === true) masteryCommitted = true;
					}
```

Leave the `toolOutputText(event.data?.output)` call above it untouched — a `content_and_artifact`
tool still puts the prose on `ToolMessage.content`, which that helper already handles, so
`retrievedContent` is unaffected.

- [x] **Step 4: Run them, expect PASS** — plus `pnpm typecheck`, `pnpm check`.

Run: `pnpm vitest run server/services/lessonAI/`

- [x] **Step 5: Commit**

```bash
git commit -m "fix(lessonAI): decide the retained-write signal from a tool artifact"
```

---

## Task 5: Give L2 a latency budget (F2)

**Files:**
- Modify: `server/services/_shared/aiGuard/topicRelevance.ts:44-48`
- Test: `server/services/_shared/aiGuard/guardUserInput.test.ts`

- [x] **Step 1: Write the failing test**

The existing suite mocks `checkTopicRelevance` wholesale, so a timeout test there would only prove
the mock. Test the two halves separately.

In `guardUserInput.test.ts`, prove the *slow* path lands on the fallback (a rejection after a delay,
per the spec's Agent notes — not an immediate rejection, which the suite already covers):

```ts
	it("fails open and reports fallback_triggered when L2 exceeds its budget", async () => {
		mockCheckTopicRelevance.mockImplementationOnce(
			() =>
				new Promise((_resolve, reject) =>
					setTimeout(() => reject(new Error("timeout")), 10),
				),
		);

		const result = await guardUserInput("What is recursion?", context);

		expect(result.outcome).toBe("allow");
		const outcomes = mockLogger.warn.mock.calls.map(
			(call) => (call[0] as { outcome?: string }).outcome,
		);
		expect(outcomes).toContain("fallback_triggered");
	});
```

Create `server/services/_shared/aiGuard/topicRelevance.test.ts` to pin the budget itself:

```ts
import { describe, expect, it, vi } from "vitest";

const { mockChatOpenAI } = vi.hoisted(() => ({ mockChatOpenAI: vi.fn() }));

vi.mock("@langchain/openai", () => ({
	ChatOpenAI: class {
		constructor(config: Record<string, unknown>) {
			mockChatOpenAI(config);
		}
		withStructuredOutput() {
			return { invoke: () => Promise.resolve({ onTopic: true, reason: "ok" }) };
		}
	},
}));

const { checkTopicRelevance } = await import("./topicRelevance");

describe("checkTopicRelevance", () => {
	// L2 sits in the request path of every tutor turn. Without a budget the SDK
	// default is minutes with retries, and guardUserInput's fail-open never fires
	// because a hang is not an error (review F2).
	it("declares a timeout and bounded retries", async () => {
		await checkTopicRelevance("what is recursion?", {
			description: "the course",
			subject: "the course",
		});

		expect(mockChatOpenAI).toHaveBeenCalledWith(
			expect.objectContaining({ timeout: 3_000, maxRetries: 1 }),
		);
	});
});
```

- [x] **Step 2: Run them, expect FAIL**

Run: `pnpm vitest run server/services/_shared/aiGuard/topicRelevance.test.ts`
Expected: FAIL — the constructor config has no `timeout`.

- [x] **Step 3: Implement minimally**

`topicRelevance.ts`:

```ts
/**
 * The budget is deliberate, not a tuning constant. L2 runs before the first token
 * of every tutor turn, and guardUserInput's fail-open (guardUserInput.ts:83-96)
 * only catches errors — a provider that is slow rather than down produces neither
 * an error nor a fallback_triggered event, just a waiting student. Exceeding the
 * budget throws, which lands on that same fallback. See security.md S10.
 */
const L2_TIMEOUT_MS = 3_000;

export const checkTopicRelevance = async (
	text: string,
	domain: GuardDomain,
): Promise<{ onTopic: boolean; reason: string }> => {
	const model = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0,
		apiKey: env.OPENAI_API_KEY,
		timeout: L2_TIMEOUT_MS,
		maxRetries: 1,
	}).withStructuredOutput(GuardOutputSchema);

	return model.invoke([
		{ role: "system", content: buildSystemPrompt(domain) },
		{ role: "user", content: wrapUntrustedContent(text, "course_data") },
	]);
};
```

- [x] **Step 4: Run them, expect PASS** — and confirm the pre-existing "still blocks at L1 when L2 is
unavailable" case is still green (L1 must keep running underneath the fail-open).

Run: `pnpm vitest run server/services/_shared/aiGuard/`

- [x] **Step 5: Commit**

```bash
git commit -m "fix(aiGuard): give the L2 classifier an explicit latency budget"
```

---

## Task 6: Bound replayed history by characters as well as messages (F5)

**Files:**
- Modify: `server/repositories/lessonAssistant.repository.ts:33-55`
- Test: `server/repositories/lessonAssistant.repository.integration.test.ts`

- [x] **Step 1: Write the failing test**

```ts
it("bounds the model context by characters, keeping whole newest messages", async () => {
	const long = "x".repeat(3_000);
	for (let i = 0; i < 5; i++) {
		await lessonAssistantRepository.saveMessage(lessonId, studentId, {
			role: "user",
			content: `${i}-${long}`,
		});
	}

	const context = await lessonAssistantRepository.getContextMessages(lessonId, studentId);

	const chars = context.reduce((sum, m) => sum + m.content.length, 0);
	expect(chars).toBeLessThanOrEqual(8_000);
	// Newest kept, oldest dropped, and nothing split.
	expect(context.at(-1)?.content.startsWith("4-")).toBe(true);
	expect(context.every((m) => m.content.length === long.length + 2)).toBe(true);
});

it("keeps at least one message even when it alone exceeds the budget", async () => {
	await lessonAssistantRepository.saveMessage(lessonId, studentId, {
		role: "user",
		content: "y".repeat(20_000),
	});

	const context = await lessonAssistantRepository.getContextMessages(lessonId, studentId);

	expect(context).toHaveLength(1);
});
```

- [x] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run server/repositories/lessonAssistant.repository.integration.test.ts -t "bounds the model context"`
Expected: FAIL — 15,010 characters returned, budget not applied.

- [x] **Step 3: Implement minimally**

```ts
const MODEL_CONTEXT_MESSAGE_LIMIT = 20;
/**
 * The message limit bounds neither cost nor prompt dilution — 20 turns at the
 * 2,000-char input cap is ~40 KB, so a student writing long messages gets 20× the
 * dilution of one writing short ones, which is backwards from what the limit is
 * for. Trimming is by whole messages: a truncated turn is a new injection
 * primitive. See spec.md scope item 11.
 */
const MODEL_CONTEXT_CHAR_BUDGET = 8_000;
```

and, replacing the `return rows.reverse();` at `:54`:

```ts
		// rows is newest-first here; keep taking while the budget allows, then flip
		// back to chronological order. The length guard keeps one message even when
		// it alone busts the budget — an empty context is worse than a long one.
		const kept: typeof rows = [];
		let used = 0;
		for (const row of rows) {
			if (kept.length > 0 && used + row.content.length > MODEL_CONTEXT_CHAR_BUDGET) {
				break;
			}
			kept.push(row);
			used += row.content.length;
		}
		return kept.reverse();
```

- [x] **Step 4: Run it, expect PASS** — plus `pnpm typecheck`, `pnpm check`.

- [x] **Step 5: Commit**

```bash
git commit -m "fix(lessonAssistant): bound replayed context by characters, not only count"
```

---

## Task 7: Key the AI rate limiter per feature (F6a)

**Files:**
- Modify: `server/utils/aiRateLimiter.ts:8`
- Modify: `app/api/chat/lesson/route.ts:26`, `app/api/chat/course/route.ts:33`,
  `app/api/chat/learning-path/route.ts:19`
- Test: `server/utils/aiRateLimiter.test.ts` (create if absent)

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { checkAiRateLimit } from "./aiRateLimiter";

describe("checkAiRateLimit", () => {
	// One bucket for three features meant using the tutor consumed the same
	// account's course-builder allowance (review F6).
	it("does not let one feature consume another's allowance", () => {
		const userId = `user-${Math.random()}`;
		for (let i = 0; i < 20; i++) {
			expect(checkAiRateLimit(userId, "lessonAI")).toBe(true);
		}
		expect(checkAiRateLimit(userId, "lessonAI")).toBe(false);
		expect(checkAiRateLimit(userId, "courseAI")).toBe(true);
	});
});
```

- [x] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run server/utils/aiRateLimiter.test.ts`
Expected: FAIL — TypeScript rejects the second argument; after that, `courseAI` returns `false`.

- [x] **Step 3: Implement minimally**

```ts
export type AiRateLimitFeature = "lessonAI" | "courseAI" | "learningPathAI";

export function checkAiRateLimit(
	userId: string,
	feature: AiRateLimitFeature,
): boolean {
	const now = Date.now();
	const key = `${userId}:${feature}`;
	// … body unchanged, with `windows.get(key)` / `windows.set(key, …)`
```

Update all three call sites: `checkAiRateLimit(session.user.id, "lessonAI")`,
`…, "courseAI")`, `…, "learningPathAI")`. A missed call site is a type error, which is the point of
the union type rather than a bare `string`.

The per-process caveat is unchanged — this narrows the blast radius of a shared bucket, it does not
make the limiter distributed (spec.md "Out of scope", `security.md` S13 §17 / R3).

- [x] **Step 4: Run it, expect PASS** — plus `pnpm typecheck` (which proves all three call sites moved).

- [x] **Step 5: Commit**

```bash
git commit -m "fix(aiRateLimiter): key the window per user and feature"
```

---

## Task 8: Declare the tutor's per-request model-call ceiling (F6b)

**Files:**
- Modify: `server/services/lessonAI/lessonAI.service.ts:84-87`
- Test: `server/services/lessonAI/lessonAI.service.test.ts`

- [x] **Step 1: Write the failing test**

```ts
it("declares an explicit recursion limit on the agent stream", async () => {
	await collect([tokenEvent("A base case stops the recursion.")]);

	expect(mockStreamEvents).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({ recursionLimit: 12 }),
	);
});
```

- [x] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run server/services/lessonAI/lessonAI.service.test.ts -t "recursion limit"`
Expected: FAIL — the config is `{ version: "v2", signal }`.

- [x] **Step 3: Implement minimally**

```ts
/**
 * One tutor request is not one model call: L2, the router pass, each tool, then
 * the answer. LangGraph's default ceiling is 25; 12 is enough for the four tools
 * plus retries and makes the per-request cost a decision rather than a default
 * (spec.md scope item 11).
 */
const AGENT_RECURSION_LIMIT = 12;
```

and in `streamEvents`:

```ts
					agent.streamEvents(
						{ messages: [...langchainHistory, new HumanMessage(userMessage)] },
						{ version: "v2", signal, recursionLimit: AGENT_RECURSION_LIMIT },
					),
```

Exceeding it throws `GraphRecursionError`, which the existing `catch` already converts to the
standard `{ type: "error" }` event — the student sees the neutral error, not a stack trace. Confirm
this by reading the catch after Task 2's edit; add no new handling.

- [x] **Step 4: Run it, expect PASS** — plus `pnpm typecheck`, `pnpm check`.

- [x] **Step 5: Commit**

```bash
git commit -m "fix(lessonAI): declare an explicit agent recursion limit"
```

---

## Task 9: Gate Docs — correct the requirements the code now contradicts (F7)

Not a docs chore: `security.md` is written to be implementable without reading the code, so a stale
requirement there propagates into the next AI surface. This is why F7 is in scope.

**Files:**
- Modify: `docs/specs/features/ai-tutor-guardrails/security.md`
- Modify: `docs/specs/features/ai-tutor-guardrails/threat-model.md`
- Modify: `docs/specs/features/ai-tutor-guardrails/spec.md` (frontmatter)
- Modify: `docs/adr/022-ai-input-trust-boundary.md`, `docs/adr/024-lesson-tutor-authority-boundaries.md`

- [x] **Step 1: `security.md` edits** — each one a requirement, not a changelog entry:

  - **S6** — widen the `contextEligible` rule to output rejections (Task 3). Correct the sentence
    claiming a *blocked* turn is stored: it is not. The stored-with-`contextEligible: false`
    behaviour is the off-topic branch.
  - **S8** — the output boundary runs on completion, on client abort, and on mid-stream error
    (Task 2). State that persistence stays suppressed on the latter two and no `retract` is sent.
  - **S9** — split the single "L1 block" row into `L1 block → persisted: nothing` and
    `L2 off-topic → both rows, contextEligible: false`.
  - **S10** — the fail-open covers timeout as well as error; name the 3 s budget (Task 5).
  - **S11** — `mastery_write_retained` is decided from the tool artifact (Task 4).
  - **S13 §17** — correct the file reference to `server/utils/aiRateLimiter.ts`; record the
    per-feature key and the recursion limit; keep the per-process property **open**.
  - **S13** — add the consequence the spec names: Task 5 slightly *widens* §28's window by turning
    some slow calls into fail-open allows. Record it as a stated trade, not a silent one.
  - **S13 §2** — note that the accepted streaming disclosure now has the compensating control it was
    priced against on every exit, not only the happy path.

- [x] **Step 2: `threat-model.md`** — R2's residual: the disclosure stands, the detection gap closes.

- [x] **Step 3: ADR amendments** (the decision the spec flagged for `/qa`). Add a dated
  "Amendment 2026-08" paragraph to each; do **not** write a new ADR — no decision is reversed:
  - **ADR-024** decision 2 — "validated before persistence, retracted before completion" now covers
    the abort and mid-stream-error exits.
  - **ADR-022** — `contextEligible` is triggered by output rejection as well as input rejection.

- [x] **Step 4: Flip the spec and regenerate the index**

```bash
# spec.md frontmatter: status: in-progress → stable
pnpm spec:sync
```

- [x] **Step 5: Verify and commit**

```bash
pnpm check && pnpm typecheck
git commit -m "docs(ai-tutor-guardrails): align the security requirements with the hardened flow"
```

---

## Self-review (run before handoff)

**Spec coverage** — every acceptance criterion in `spec.md` against a task:

| Criterion group | Criterion | Task |
|---|---|---|
| Abort path | aborted + failing reply still emits `output_validation_failed` | 2 |
| Abort path | aborted turn writes no assistant row | 2 |
| Abort path | aborted + clean reply emits nothing | 2 |
| Abort path | aborted before any token emits and writes nothing | 2 |
| Abort path | aborted + committed write + rejection still emits `mastery_write_retained` | 2 |
| L2 budget | timeout → `allow` + `fallback_triggered` with `ruleIds: ["l2_unavailable"]` | 5 |
| L2 budget | a turn is never blocked because L2 was slow | 5 |
| L2 budget | L1 still blocks when L2 times out | 5 (pre-existing case kept green) |
| Rejected context | rejected reply ⇒ user turn `contextEligible: false` | 3 |
| Rejected context | `getContextMessages` omits it next turn | 3 (integration) |
| Rejected context | `getMessages` still returns it | 3 (integration) |
| Rejected context | clean reply leaves the turn eligible | 3 |
| Rejected context | blocked turn still persists nothing | 1 (route branch untouched; assert in 3) |
| Mastery signal | denial never counted, independent of `NEUTRAL_REFUSAL_MESSAGE` | 4 |
| Mastery signal | commit + rejection ⇒ exactly one event | 4 |
| Mastery signal | commit + clean reply ⇒ none | 4 |
| Mastery signal | tool still reads as natural language to the model | 4 |
| Bounds | 20 × 2,000 chars replays within budget, newest, whole, in order | 6 |
| Bounds | trimming never splits a message | 6 |
| Bounds | tutor allowance does not reduce builder allowance | 7 |
| Bounds | exceeding `recursionLimit` fails as a bounded error | 8 |

**Gaps found and closed:** the "blocked turn still persists nothing" criterion had no owning task —
added as an assertion in Task 3 rather than a task of its own, since no code changes to reach it.

**Placeholder scan:** no `TBD`/`TODO`/"handle edge cases"/"similar to Task N" in any code step.

**Type consistency:** `markContextIneligible`, `finishWithoutDelivery`, `runOutputBoundary`,
`AiRateLimitFeature`, `MODEL_CONTEXT_CHAR_BUDGET`, `AGENT_RECURSION_LIMIT`, `L2_TIMEOUT_MS`,
`{ committed, concept, level }` — each spelled identically everywhere it appears above.

**Sequencing:** Task 1 must land before Tasks 2 and 3 (both consume `userRow` / the converged
exits). Tasks 5–8 are independent and may run in any order or in parallel. Task 9 last.

## Final verification

- `pnpm typecheck` — clean.
- `pnpm check` — clean.
- `pnpm test:unit` — green, including the pre-existing `lessonAI.service.test.ts` "output boundary"
  and `guardUserInput.test.ts` suites, which must not have been weakened to pass.
- `pnpm test:integration` — green (requires `learnix_test`; see `.env.test.example`).
- **No eval run required** — no task changes a prompt or a guard pattern. State this in the PR so the
  omission is visible as a decision.
- Manual: open a lesson tutor thread, ask a normal question, confirm the reply streams and persists
  once. Then reload — the thread must show exactly one copy of your message (this is the Task 1
  duplication fix, and it is not covered end-to-end by any automated test).
- Manual: with the network throttled, confirm a tutor turn still answers within a few seconds rather
  than hanging (Task 5).