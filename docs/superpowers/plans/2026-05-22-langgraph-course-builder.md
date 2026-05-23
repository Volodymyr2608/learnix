# LangGraph Course Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LCEL-based `CourseAIService` with a single LangGraph `StateGraph` that adds tool-aware reasoning, self-scored confidence with auto-advance, and a revision path — without changing the database schema or breaking the existing SSE contract.

**Architecture:** One compiled `StateGraph` (Zod-defined state via `@langchain/langgraph/zod`) with eleven nodes: `classify_intent`, `revise_prior_field`, `tool_router`, `tool_node`, `chat_response`, `assess_completion`, `extract_step_data`, `validate`, `confidence_score`, `clarify`, `persist_and_emit`. Two modes per HTTP request — `chat` (entry at `classify_intent`, may auto-persist) and `finalize` (entry at `extract_step_data`, always persists on validation pass). State is hydrated from existing `CourseGeneration` + `CourseGenerationMessage` tables; no checkpointer.

**Tech Stack:** TypeScript, Next.js 15 App Router, `@langchain/langgraph@^1.3.0` (already installed), `@langchain/openai`, `@langchain/core`, Zod, Prisma, tRPC, Server-Sent Events.

**Spec source:** `docs/specs/2026-05-22-langgraph-course-builder/` (requirements.md, plan.md, validation.md). Do not re-derive; this plan implements that design.

**Verification posture:** No Vitest in this project (per ADR-013 / CLAUDE.md — LangSmith evals only). Each task ends with `pnpm typecheck` + `pnpm check` and a commit. Smoke-runs use one-off `tsx` scripts under `evals/courseAI/_smoke/` (not committed long-term, gitignored). LangSmith evals are wired in Phase E.

---

## Phase A — Prep & scaffolding

### Task 1: Extract canonical category list

**Files:**
- Create: `lib/constants/courseCategories.ts`
- Modify: `app/_components/Course/components/FormCards/BasicInformationForm/index.tsx:60-77`

The current category options live inline in the form. Extract them to a single source of truth so the graph's `lookup_category_taxonomy` tool can return the same values the UI offers.

- [ ] **Step 1: Create the constants module**

```ts
// lib/constants/courseCategories.ts
export const COURSE_CATEGORIES = [
	{ value: "development", label: "Development" },
	{ value: "design", label: "Design" },
	{ value: "business", label: "Business" },
	{ value: "marketing", label: "Marketing" },
	{ value: "data-science", label: "Data Science" },
] as const;

export type CourseCategoryValue = (typeof COURSE_CATEGORIES)[number]["value"];

/** Values only — what the AI tool returns. */
export const COURSE_CATEGORY_VALUES: readonly CourseCategoryValue[] =
	COURSE_CATEGORIES.map((c) => c.value);
```

- [ ] **Step 2: Refactor the form to import the list**

In `app/_components/Course/components/FormCards/BasicInformationForm/index.tsx`, replace the inline array at lines ~60-77 with:

```tsx
import { COURSE_CATEGORIES } from "@/lib/constants/courseCategories";
// ...
<ControlledSelect
    control={control}
    id="category"
    items={[...COURSE_CATEGORIES]}
    label="Category *"
    name="category"
    placeholder="Select category"
/>
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm check`
Expected: both pass with no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/constants/courseCategories.ts app/_components/Course/components/FormCards/BasicInformationForm/index.tsx
git commit -m "refactor(course): extract category list to lib/constants/courseCategories"
```

---

### Task 2: Add `CourseAIToolError` for typed tool-failure logging

**Files:**
- Modify: `server/services/courseAI/courseAI.errors.ts`

- [ ] **Step 1: Append the new error class**

```ts
// server/services/courseAI/courseAI.errors.ts
import { DomainError } from "@/server/services/base/base.errors";

export class CourseAIError extends DomainError {}
export class CourseAIToolError extends DomainError {}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/courseAI.errors.ts
git commit -m "feat(courseAI): add CourseAIToolError for typed tool-failure logging"
```

---

### Task 3: Define the Zod state schema

**Files:**
- Create: `server/services/courseAI/graph/state.ts`

- [ ] **Step 1: Create the file**

```ts
// server/services/courseAI/graph/state.ts
import "@langchain/langgraph/zod";
import { z } from "zod";
import { DraftStep } from "@/generated/prisma";

const draftStep = z.nativeEnum(DraftStep);

const historyEntry = z.object({
	role: z.enum(["user", "assistant"]),
	content: z.string(),
	step: draftStep,
});

export const CourseBuilderState = z.object({
	// hydrated at request start
	generationId: z.string(),
	instructorId: z.string(),
	currentStep: draftStep,
	content: z.record(z.string(), z.unknown()).default(() => ({})),
	history: z.array(historyEntry).default(() => []),
	mode: z.enum(["chat", "finalize"]),

	// current turn — set by route handler
	userMessage: z.string().default(""),

	// produced by nodes
	intent: z.enum(["continue", "revise"]).nullable().default(null),
	reviseTarget: draftStep.nullable().default(null),
	toolCalls: z
		.array(z.unknown())
		.default(() => [])
		.langgraph.reducer(
			(prev, next) => prev.concat(Array.isArray(next) ? next : [next]),
			z.union([z.unknown(), z.array(z.unknown())]),
		),
	assessReady: z.boolean().default(false),
	draftStepData: z.unknown().default(undefined),
	confidence: z.number().min(0).max(1).default(0),
	shouldAutoAdvance: z.boolean().default(false),
	assistantText: z
		.string()
		.default("")
		.langgraph.reducer((prev, next) => prev + next, z.string()),
	validationErrors: z.array(z.unknown()).nullable().default(null),
});

export type CourseBuilderStateT = z.infer<typeof CourseBuilderState>;
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean. Tests the side-effect import `@langchain/langgraph/zod` works in this codebase's TS config.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/state.ts
git commit -m "feat(courseAI): scaffold Zod-based graph state with langgraph reducers"
```

---

### Task 4: Add `withNodeErrors` helper

**Files:**
- Create: `server/services/courseAI/graph/withNodeErrors.ts`

- [ ] **Step 1: Create the helper**

```ts
// server/services/courseAI/graph/withNodeErrors.ts
import { CourseAIError } from "@/server/services/courseAI/courseAI.errors";
import { logger } from "@/server/utils/logger";
import type { CourseBuilderStateT } from "./state";

type NodeFn = (
	state: CourseBuilderStateT,
) => Promise<Partial<CourseBuilderStateT>>;

/**
 * Wraps a node body so unexpected throws are logged and converted to
 * CourseAIError(name). Validation/tool failures are NOT supposed to throw —
 * they're routed through the graph's clarify / tool-error fallback paths.
 */
export const withNodeErrors = (name: string, fn: NodeFn): NodeFn => {
	return async (state) => {
		try {
			return await fn(state);
		} catch (err) {
			logger.error(err);
			throw new CourseAIError(`[courseAI.graph] node "${name}" failed`);
		}
	};
};
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/withNodeErrors.ts
git commit -m "feat(courseAI): add withNodeErrors wrapper for graph nodes"
```

---

## Phase B — Tools

Each tool uses `tool({ name, description, schema, func })` from `@langchain/core/tools`. Each `func` catches all errors and **returns** a JSON string `{ "error": "..." }` rather than throwing, so `ToolNode` produces a normal tool message and the LLM can continue.

### Task 5: `search_similar_courses` tool

**Files:**
- Create: `server/services/courseAI/tools/searchSimilarCourses.ts`

- [ ] **Step 1: Create the tool**

```ts
// server/services/courseAI/tools/searchSimilarCourses.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { courseRepository } from "@/server/repositories/course.repository";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import { CourseAIToolError } from "@/server/services/courseAI/courseAI.errors";
import { logger } from "@/server/utils/logger";

export const searchSimilarCoursesTool = tool(
	async ({ query, limit = 5 }) => {
		try {
			const vector = await embeddingsService.embedQuery(query);
			const hits = await embeddingRepository.searchCourses(vector, limit);
			if (hits.length === 0) {
				return JSON.stringify({ results: [] });
			}
			const ids = hits.map((h) => h.id);
			const courses = await courseRepository.findMany({
				where: { id: { in: ids } },
				include: { sections: { select: { id: true } } },
			});
			const byId = new Map(courses.map((c) => [c.id, c]));
			const results = hits
				.map((h) => {
					const c = byId.get(h.id);
					if (!c) return null;
					return {
						title: c.title,
						subtitle: c.subtitle ?? "",
						sectionCount: c.sections?.length ?? 0,
					};
				})
				.filter((r): r is NonNullable<typeof r> => r !== null);
			return JSON.stringify({ results });
		} catch (err) {
			logger.error(new CourseAIToolError(`search_similar_courses: ${String(err)}`));
			return JSON.stringify({
				error: "tool failed; proceed without similar-course context",
			});
		}
	},
	{
		name: "search_similar_courses",
		description:
			"Search the catalog of published courses by semantic similarity to a query string. Use for inspiration, to avoid duplicates, or to suggest curriculum patterns. Returns top results with title, subtitle, and section count.",
		schema: z.object({
			query: z.string().describe("Search query (e.g. course topic or title idea)."),
			limit: z
				.number()
				.int()
				.min(1)
				.max(10)
				.optional()
				.describe("How many results to return (default 5)."),
		}),
	},
);
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean. If `courseRepository.findMany` with `include: { sections: ... }` doesn't typecheck, adjust the `include` clause to whatever the repository accepts (the goal is `sectionCount`; falling back to a second `count` query is acceptable).

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/tools/searchSimilarCourses.ts
git commit -m "feat(courseAI): add search_similar_courses tool (pgvector)"
```

---

### Task 6: `fetch_instructor_prior_courses` tool (instructorId via RunnableConfig)

**Files:**
- Create: `server/services/courseAI/tools/fetchInstructorPriorCourses.ts`

The LLM cannot supply `instructorId` as an argument (security). Instead the route handler injects it via LangGraph's `RunnableConfig.configurable` per invocation, and the tool reads it from the second `func` arg.

- [ ] **Step 1: Create the tool**

```ts
// server/services/courseAI/tools/fetchInstructorPriorCourses.ts
import { tool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { courseRepository } from "@/server/repositories/course.repository";
import { CourseAIToolError } from "@/server/services/courseAI/courseAI.errors";
import { logger } from "@/server/utils/logger";

export const fetchInstructorPriorCoursesTool = tool(
	async (_args, config: RunnableConfig | undefined) => {
		const instructorId = (config?.configurable as
			| { instructorId?: string }
			| undefined)?.instructorId;
		if (!instructorId) {
			logger.error(
				new CourseAIToolError(
					"fetch_instructor_prior_courses: missing instructorId in RunnableConfig.configurable",
				),
			);
			return JSON.stringify({
				error: "tool failed; missing instructor context",
			});
		}
		try {
			const courses = await courseRepository.findMany({
				where: { instructorId, deletedAt: null },
				select: {
					id: true,
					title: true,
					level: true,
					category: true,
					language: true,
				},
			});
			return JSON.stringify({ results: courses });
		} catch (err) {
			logger.error(
				new CourseAIToolError(
					`fetch_instructor_prior_courses: ${String(err)}`,
				),
			);
			return JSON.stringify({
				error: "tool failed; proceed without prior-course context",
			});
		}
	},
	{
		name: "fetch_instructor_prior_courses",
		description:
			"Fetch the current instructor's existing courses to preserve voice/style, reuse common requirements, or suggest a curriculum template. Takes no arguments.",
		schema: z.object({}),
	},
);
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean. Adjust `select` keys to whatever `courseRepository` supports if needed.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/tools/fetchInstructorPriorCourses.ts
git commit -m "feat(courseAI): add fetch_instructor_prior_courses tool (reads instructorId from config)"
```

---

### Task 7: `validate_curriculum_coherence` tool

**Files:**
- Create: `server/services/courseAI/tools/validateCurriculumCoherence.ts`

Sub-LLM call returning `{ passes, issues }`. Only useful during the `curriculum` step.

- [ ] **Step 1: Create the tool**

```ts
// server/services/courseAI/tools/validateCurriculumCoherence.ts
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "@/lib/env";
import { CourseAIToolError } from "@/server/services/courseAI/courseAI.errors";
import { logger } from "@/server/utils/logger";

const sectionSchema = z.object({
	title: z.string(),
	order: z.number().optional(),
	lessons: z
		.array(z.object({ title: z.string(), duration: z.string().optional() }))
		.min(1),
});

const argsSchema = z.object({
	sections: z.array(sectionSchema).min(1),
	level: z.string(),
	objectives: z.array(z.string()).min(1),
});

const resultSchema = z.object({
	passes: z.boolean(),
	issues: z
		.array(z.string())
		.describe("Empty when passes is true."),
});

export const validateCurriculumCoherenceTool = tool(
	async ({ sections, level, objectives }) => {
		try {
			const judge = new ChatOpenAI({
				model: "gpt-4o-mini",
				temperature: 0,
				apiKey: env.OPENAI_API_KEY,
			}).withStructuredOutput(resultSchema);

			const prompt = `
You are an instructional-design reviewer. Judge whether the curriculum below
covers all stated objectives and is appropriate for the level.

LEVEL: ${level}

OBJECTIVES:
${objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

CURRICULUM (JSON):
${JSON.stringify(sections, null, 2)}

Rules:
- "passes" is true ONLY if every objective is plausibly covered by at least one
  lesson AND the sequencing is appropriate for the level.
- Otherwise list specific issues (e.g., "objective 'X' uncovered", "lesson
  'Y' assumes advanced knowledge but level is Beginner").
`.trim();

			const result = await judge.invoke([{ role: "user", content: prompt }]);
			return JSON.stringify(result);
		} catch (err) {
			logger.error(
				new CourseAIToolError(`validate_curriculum_coherence: ${String(err)}`),
			);
			return JSON.stringify({
				error: "tool failed; proceed without coherence check",
			});
		}
	},
	{
		name: "validate_curriculum_coherence",
		description:
			"Check whether the proposed curriculum covers all stated objectives and is appropriate for the course level. Returns { passes, issues[] }. Use during the curriculum step before suggesting changes.",
		schema: argsSchema,
	},
);
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/tools/validateCurriculumCoherence.ts
git commit -m "feat(courseAI): add validate_curriculum_coherence sub-LLM tool"
```

---

### Task 8: `lookup_category_taxonomy` tool

**Files:**
- Create: `server/services/courseAI/tools/lookupCategoryTaxonomy.ts`

- [ ] **Step 1: Create the tool**

```ts
// server/services/courseAI/tools/lookupCategoryTaxonomy.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { COURSE_CATEGORIES } from "@/lib/constants/courseCategories";

export const lookupCategoryTaxonomyTool = tool(
	async () => {
		return JSON.stringify({
			categories: COURSE_CATEGORIES.map((c) => ({
				value: c.value,
				label: c.label,
			})),
		});
	},
	{
		name: "lookup_category_taxonomy",
		description:
			"Return the canonical list of course categories supported by the platform. Use this to pick a valid category value instead of inventing one.",
		schema: z.object({}),
	},
);
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/tools/lookupCategoryTaxonomy.ts
git commit -m "feat(courseAI): add lookup_category_taxonomy tool"
```

---

## Phase C — Nodes (no graph wiring yet)

Each node has shape `async (state) => Partial<state>`. Wrap with `withNodeErrors(name, fn)` on export.

### Task 9: `classifyIntent` node

**Files:**
- Create: `server/services/courseAI/graph/nodes/classifyIntent.ts`

- [ ] **Step 1: Create the node**

```ts
// server/services/courseAI/graph/nodes/classifyIntent.ts
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { DraftStep } from "@/generated/prisma";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

const outSchema = z.object({
	intent: z.enum(["continue", "revise"]),
	reviseTarget: z.nativeEnum(DraftStep).nullable(),
	reason: z.string(),
});

export const classifyIntent = withNodeErrors(
	"classify_intent",
	async (state) => {
		// First turn cannot revise: skip the call.
		if (state.history.length === 0) {
			return { intent: "continue", reviseTarget: null };
		}

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(outSchema);

		const historyText = state.history
			.map((m) => `[${m.role}@${m.step}]: ${m.content}`)
			.join("\n");

		const prompt = `
Classify the user's latest turn.

CURRENT STEP: ${state.currentStep}

CONVERSATION SO FAR:
${historyText}

USER'S NEW MESSAGE:
${state.userMessage}

Decide:
- "continue": the user is moving forward / answering for the current step.
- "revise": the user wants to change a value they already provided in an earlier
  step (e.g., "actually change the level to Advanced"). Set reviseTarget to the
  DraftStep they want to modify (one of: basic, objectives, requirements, curriculum).

If unsure, default to "continue".
`.trim();

		try {
			const out = await model.invoke([{ role: "user", content: prompt }]);
			return {
				intent: out.intent,
				reviseTarget: out.intent === "revise" ? out.reviseTarget : null,
			} satisfies Partial<CourseBuilderStateT>;
		} catch {
			// Defensive: if structured output parsing fails, default to continue.
			return { intent: "continue", reviseTarget: null };
		}
	},
);
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/nodes/classifyIntent.ts
git commit -m "feat(courseAI): add classifyIntent graph node"
```

---

### Task 10: `revisePriorField` node

**Files:**
- Create: `server/services/courseAI/graph/nodes/revisePriorField.ts`

- [ ] **Step 1: Create the node**

```ts
// server/services/courseAI/graph/nodes/revisePriorField.ts
import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

export const revisePriorField = withNodeErrors(
	"revise_prior_field",
	async (state) => {
		if (!state.reviseTarget) {
			// Shouldn't happen — classifyIntent guarantees reviseTarget when intent=revise.
			return { assistantText: "I couldn't tell which field to revise." };
		}

		const target = state.reviseTarget;
		const partial = getValidatorForStep(target).partial();

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(partial);

		const prompt = `
The user wants to revise a field in the "${target}" step.
Current values for that step: ${JSON.stringify(state.content[target] ?? {}, null, 2)}
User's revision request: "${state.userMessage}"

Return ONLY the fields that should change. Do not repeat unchanged fields.
`.trim();

		const patch = await model.invoke([{ role: "user", content: prompt }]);

		const mergedTargetContent = {
			...((state.content[target] as Record<string, unknown> | undefined) ?? {}),
			...(patch as Record<string, unknown>),
		};

		const nextContent = {
			...state.content,
			[target]: mergedTargetContent,
		};

		const summary = `Updated ${target}: ${Object.keys(patch as object).join(", ")}.`;

		return {
			content: nextContent,
			assistantText: summary,
		} satisfies Partial<CourseBuilderStateT>;
	},
);
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/nodes/revisePriorField.ts
git commit -m "feat(courseAI): add revisePriorField graph node"
```

---

### Task 11: `toolRouter` node

**Files:**
- Create: `server/services/courseAI/graph/nodes/toolRouter.ts`

- [ ] **Step 1: Create the node**

```ts
// server/services/courseAI/graph/nodes/toolRouter.ts
import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { DraftStep } from "@/generated/prisma";
import { env } from "@/lib/env";
import { buildSystemPrompt } from "@/server/services/courseAI/prompts/systemPrompt";
import { fetchInstructorPriorCoursesTool } from "@/server/services/courseAI/tools/fetchInstructorPriorCourses";
import { lookupCategoryTaxonomyTool } from "@/server/services/courseAI/tools/lookupCategoryTaxonomy";
import { searchSimilarCoursesTool } from "@/server/services/courseAI/tools/searchSimilarCourses";
import { validateCurriculumCoherenceTool } from "@/server/services/courseAI/tools/validateCurriculumCoherence";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

export const toolsForState = (state: CourseBuilderStateT) => {
	const base = [
		searchSimilarCoursesTool,
		fetchInstructorPriorCoursesTool,
		lookupCategoryTaxonomyTool,
	];
	if (state.currentStep === DraftStep.curriculum) {
		base.push(validateCurriculumCoherenceTool);
	}
	return base;
};

export const toolRouter = withNodeErrors("tool_router", async (state) => {
	const tools = toolsForState(state);

	const model = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0.4,
		apiKey: env.OPENAI_API_KEY,
	}).bindTools(tools);

	const systemPrompt = buildSystemPrompt({
		step: state.currentStep,
		currentCourseData: state.content as Record<string, unknown>,
	});

	const messages = [
		{ role: "system" as const, content: systemPrompt },
		...state.history.map((m) => ({ role: m.role, content: m.content })),
		{ role: "user" as const, content: state.userMessage },
	];

	const response = (await model.invoke(messages)) as AIMessage;

	const toolCalls = (response.tool_calls ?? []).map((tc) => ({
		id: tc.id,
		name: tc.name,
		args: tc.args,
	}));

	return { toolCalls } satisfies Partial<CourseBuilderStateT>;
});
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/nodes/toolRouter.ts
git commit -m "feat(courseAI): add toolRouter graph node binding the four tools"
```

---

### Task 12: `chatResponse` node (streaming)

**Files:**
- Create: `server/services/courseAI/graph/nodes/chatResponse.ts`

This node replaces today's `streamChatResponse`. It streams via `model.stream()` and accumulates tokens into `assistantText` via the state reducer. The SSE route handler picks up the `on_chat_model_stream` events from `graph.streamEvents` and forwards them as `{ type: "token" }`.

- [ ] **Step 1: Create the node**

```ts
// server/services/courseAI/graph/nodes/chatResponse.ts
import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { buildSystemPrompt } from "@/server/services/courseAI/prompts/systemPrompt";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

export const chatResponse = withNodeErrors("chat_response", async (state) => {
	const model = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0.4,
		apiKey: env.OPENAI_API_KEY,
		streaming: true,
	});

	const systemPrompt = buildSystemPrompt({
		step: state.currentStep,
		currentCourseData: state.content as Record<string, unknown>,
	});

	const messages = [
		{ role: "system" as const, content: systemPrompt },
		...state.history.map((m) => ({ role: m.role, content: m.content })),
		{ role: "user" as const, content: state.userMessage },
	];

	const stream = await model.stream(messages);

	let text = "";
	for await (const chunk of stream) {
		const token = chunk.content?.toString();
		if (token) text += token;
	}

	return { assistantText: text } satisfies Partial<CourseBuilderStateT>;
});
```

Note: tokens are surfaced to the SSE route via `graph.streamEvents` (`on_chat_model_stream`), not via state. We still accumulate `text` into `assistantText` so the route handler can save the full assistant message after the stream finishes.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/nodes/chatResponse.ts
git commit -m "feat(courseAI): add chatResponse streaming node (replaces streamChatResponse)"
```

---

### Task 13: `assessCompletion` node

**Files:**
- Create: `server/services/courseAI/graph/nodes/assessCompletion.ts`

Decides whether the current step has enough info to attempt auto-persist. Only runs in chat mode (the graph routes finalize mode straight to `extract_step_data`).

- [ ] **Step 1: Create the node**

```ts
// server/services/courseAI/graph/nodes/assessCompletion.ts
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

const outSchema = z.object({
	ready: z.boolean(),
	reason: z.string(),
});

export const assessCompletion = withNodeErrors(
	"assess_completion",
	async (state) => {
		// In revision turns we never auto-advance.
		if (state.intent === "revise") return { assessReady: false };

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(outSchema);

		const historyText = [...state.history, {
			role: "assistant" as const,
			content: state.assistantText,
			step: state.currentStep,
		}]
			.map((m) => `[${m.role}@${m.step}]: ${m.content}`)
			.join("\n");

		const prompt = `
Decide whether the "${state.currentStep}" step has enough information to be
extracted into structured data without further user input.

Be CONSERVATIVE — false positives trigger premature auto-persist. Only return
ready=true if a competent instructional designer would say "yes, ship this
step as-is right now."

CONVERSATION:
${historyText}

CURRENT STRUCTURED CONTENT FOR THIS STEP:
${JSON.stringify(state.content[state.currentStep] ?? {}, null, 2)}
`.trim();

		try {
			const out = await model.invoke([{ role: "user", content: prompt }]);
			return { assessReady: out.ready } satisfies Partial<CourseBuilderStateT>;
		} catch {
			return { assessReady: false };
		}
	},
);
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/nodes/assessCompletion.ts
git commit -m "feat(courseAI): add assessCompletion gate node for auto-advance"
```

---

### Task 14: `extractStepData` node

**Files:**
- Create: `server/services/courseAI/graph/nodes/extractStepData.ts`

Replaces today's `CourseAIService.extractStepData` JSON-mode call. Uses structured output bound to the existing per-step Zod validator.

- [ ] **Step 1: Create the node**

```ts
// server/services/courseAI/graph/nodes/extractStepData.ts
import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { extractStepDataPrompt } from "@/server/services/courseAI/prompts/extractStepDataPrompt";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

export const extractStepData = withNodeErrors(
	"extract_step_data",
	async (state) => {
		const schema = getValidatorForStep(state.currentStep);

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(schema);

		const historyForPrompt = [
			...state.history,
			// include the assistant's last streamed response (chat mode) and the user's message
			...(state.assistantText
				? [{
					role: "assistant" as const,
					content: state.assistantText,
					step: state.currentStep,
				}]
				: []),
			...(state.userMessage
				? [{
					role: "user" as const,
					content: state.userMessage,
					step: state.currentStep,
				}]
				: []),
		]
			.map((m) => `[${m.role}]: ${m.content}`)
			.join("\n");

		const prompt = extractStepDataPrompt({
			step: state.currentStep,
			history: historyForPrompt,
		});

		const draft = await model.invoke([{ role: "system", content: prompt }]);

		return { draftStepData: draft } satisfies Partial<CourseBuilderStateT>;
	},
);
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/nodes/extractStepData.ts
git commit -m "feat(courseAI): add extractStepData graph node"
```

---

### Task 15: `validate` node

**Files:**
- Create: `server/services/courseAI/graph/nodes/validate.ts`

Pure function. Re-runs the Zod schema defensively and adds cross-field checks (e.g., curriculum step requires ≥1 lesson per section, but `getValidatorForStep` already enforces that). Returns `validationErrors` as an array of `ZodIssue` or `null`.

- [ ] **Step 1: Create the node**

```ts
// server/services/courseAI/graph/nodes/validate.ts
import { DraftStep } from "@/generated/prisma";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

export const validate = withNodeErrors("validate", async (state) => {
	const schema = getValidatorForStep(state.currentStep);
	const parsed = schema.safeParse(state.draftStepData);

	if (!parsed.success) {
		return { validationErrors: parsed.error.issues };
	}

	// Cross-field rule (curriculum): if objectives exist on prior step, ensure
	// at least one lesson title references each objective by keyword.
	if (state.currentStep === DraftStep.curriculum) {
		const objectives = (state.content[DraftStep.objectives] as
			| { objectives?: { value: string }[] }
			| undefined)?.objectives;
		const sections = (parsed.data as { sections: { lessons: { title: string }[] }[] })
			.sections;
		if (objectives && objectives.length > 0) {
			const titles = sections
				.flatMap((s) => s.lessons.map((l) => l.title.toLowerCase()))
				.join(" ");
			const uncovered = objectives
				.map((o) => o.value.toLowerCase())
				.filter((o) => {
					const head = o.split(/\s+/).slice(0, 3).join(" ");
					return head.length > 3 && !titles.includes(head);
				});
			if (uncovered.length > 0) {
				return {
					validationErrors: [
						{
							code: "custom",
							path: ["sections"],
							message: `Objectives appear uncovered by curriculum: ${uncovered.join("; ")}`,
						},
					],
				};
			}
		}
	}

	return { validationErrors: null } satisfies Partial<CourseBuilderStateT>;
});
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/nodes/validate.ts
git commit -m "feat(courseAI): add validate node with curriculum coverage check"
```

---

### Task 16: `confidenceScore` node

**Files:**
- Create: `server/services/courseAI/graph/nodes/confidenceScore.ts`

- [ ] **Step 1: Create the node**

```ts
// server/services/courseAI/graph/nodes/confidenceScore.ts
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

const CONFIDENCE_AUTO_ADVANCE_THRESHOLD = 0.8;

const outSchema = z.object({
	score: z.number().min(0).max(1),
	rationale: z.string(),
});

export const confidenceScore = withNodeErrors(
	"confidence_score",
	async (state) => {
		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(outSchema);

		const prompt = `
Rate your confidence (0..1) that the "${state.currentStep}" step is complete
and correct given the conversation and the extracted structured data below.

CONVERSATION:
${state.history.map((m) => `[${m.role}]: ${m.content}`).join("\n")}
[user]: ${state.userMessage}
${state.assistantText ? `[assistant]: ${state.assistantText}` : ""}

EXTRACTED DATA:
${JSON.stringify(state.draftStepData, null, 2)}

Guidelines:
- 0.9–1.0: nothing more to ask; ship.
- 0.7–0.9: solid but a single follow-up could improve it.
- 0.4–0.7: gaps remain; user input would help.
- 0.0–0.4: clearly underspecified.
`.trim();

		const out = await model.invoke([{ role: "user", content: prompt }]);
		const score = out.score;
		const shouldAutoAdvance =
			score >= CONFIDENCE_AUTO_ADVANCE_THRESHOLD &&
			state.validationErrors === null;

		return {
			confidence: score,
			shouldAutoAdvance,
		} satisfies Partial<CourseBuilderStateT>;
	},
);
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/nodes/confidenceScore.ts
git commit -m "feat(courseAI): add confidenceScore node (0.8 auto-advance threshold)"
```

---

### Task 17: `clarify` node (streaming)

**Files:**
- Create: `server/services/courseAI/graph/nodes/clarify.ts`

- [ ] **Step 1: Create the node**

```ts
// server/services/courseAI/graph/nodes/clarify.ts
import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

export const clarify = withNodeErrors("clarify", async (state) => {
	const model = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0.3,
		apiKey: env.OPENAI_API_KEY,
		streaming: true,
	});

	const issues = (state.validationErrors ?? [])
		.map((issue, i) => `${i + 1}. ${JSON.stringify(issue)}`)
		.join("\n");

	const prompt = `
You just tried to finalize the "${state.currentStep}" step but validation
failed. Ask the user ONE concise, friendly follow-up question (in their language)
that would unblock the most important missing field. Do not list every error.
Do not show JSON.

VALIDATION ERRORS:
${issues}

EXTRACTED (FAILING) DATA:
${JSON.stringify(state.draftStepData, null, 2)}
`.trim();

	const stream = await model.stream([
		{ role: "system", content: prompt },
	]);

	let text = "";
	for await (const chunk of stream) {
		const token = chunk.content?.toString();
		if (token) text += token;
	}

	return { assistantText: text } satisfies Partial<CourseBuilderStateT>;
});
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/nodes/clarify.ts
git commit -m "feat(courseAI): add clarify streaming node for validation failures"
```

---

### Task 18: `persistAndEmit` node

**Files:**
- Create: `server/services/courseAI/graph/nodes/persistAndEmit.ts`

Writes `CourseGeneration.content`, advances step, saves the assistant transition message in a single transaction. The SSE route handler emits `confidence` and `step_committed` events derived from this node's output via `graph.streamEvents`.

- [ ] **Step 1: Create the node**

```ts
// server/services/courseAI/graph/nodes/persistAndEmit.ts
import { STEP_MESSAGES } from "@/lib/constants/stepMessages";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { courseGenerationMessageRepository } from "@/server/repositories/courseGenerationMessage.repository";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

export const persistAndEmit = withNodeErrors(
	"persist_and_emit",
	async (state) => {
		const draft = state.draftStepData as Record<string, unknown>;

		await courseGenerationRepository.transaction(async () => {
			const updated = await courseGenerationRepository.updateContent(
				state.generationId,
				state.currentStep,
				draft as never, // Prisma.JsonObject — already validated by `validate` node
			);

			const nextStepId = updated.step;
			const flowText =
				STEP_MESSAGES[nextStepId] ?? "Let's continue building your course.";

			await courseGenerationMessageRepository.create({
				generationId: state.generationId,
				step: nextStepId,
				role: "assistant",
				content: flowText,
			});
		});

		// State changes returned here are picked up by the route handler via
		// graph.streamEvents → "on_chain_end" for this node.
		// shouldAutoAdvance is true only when chat-mode triggered persist.
		return {} satisfies Partial<CourseBuilderStateT>;
	},
);
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/graph/nodes/persistAndEmit.ts
git commit -m "feat(courseAI): add persistAndEmit node (single transaction, matches today's acceptStep)"
```

---

## Phase D — Wire, integrate, and ship

### Task 19: Wire the graph

**Files:**
- Create: `server/services/courseAI/graph/graph.ts`

- [ ] **Step 1: Create the graph builder**

```ts
// server/services/courseAI/graph/graph.ts
import { END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { fetchInstructorPriorCoursesTool } from "@/server/services/courseAI/tools/fetchInstructorPriorCourses";
import { lookupCategoryTaxonomyTool } from "@/server/services/courseAI/tools/lookupCategoryTaxonomy";
import { searchSimilarCoursesTool } from "@/server/services/courseAI/tools/searchSimilarCourses";
import { validateCurriculumCoherenceTool } from "@/server/services/courseAI/tools/validateCurriculumCoherence";
import { assessCompletion } from "./nodes/assessCompletion";
import { chatResponse } from "./nodes/chatResponse";
import { clarify } from "./nodes/clarify";
import { classifyIntent } from "./nodes/classifyIntent";
import { confidenceScore } from "./nodes/confidenceScore";
import { extractStepData } from "./nodes/extractStepData";
import { persistAndEmit } from "./nodes/persistAndEmit";
import { revisePriorField } from "./nodes/revisePriorField";
import { toolRouter } from "./nodes/toolRouter";
import { validate } from "./nodes/validate";
import { CourseBuilderState, type CourseBuilderStateT } from "./state";

// All four tools are static module-level instances. The instructor-scoped tool
// reads `instructorId` from `RunnableConfig.configurable` at invocation time
// (set by CourseAIService.runChat / runFinalize — see Task 20).
const allTools = [
	searchSimilarCoursesTool,
	fetchInstructorPriorCoursesTool,
	lookupCategoryTaxonomyTool,
	validateCurriculumCoherenceTool,
];

// --- route predicates -------------------------------------------------------

const routeByMode = (s: CourseBuilderStateT) =>
	s.mode === "finalize" ? "finalize" : "chat";

const routeByIntent = (s: CourseBuilderStateT) =>
	s.intent === "revise" ? "revise" : "continue";

const routeAfterToolRouter = (s: CourseBuilderStateT) =>
	s.toolCalls.length > 0 ? "use_tool" : "answer";

const routeAfterAssess = (s: CourseBuilderStateT) =>
	s.assessReady ? "ready" : "not_ready";

const routeAfterValidate = (s: CourseBuilderStateT) =>
	s.validationErrors === null ? "pass" : "fail";

const routeAfterConfidence = (s: CourseBuilderStateT) =>
	s.mode === "finalize" || s.shouldAutoAdvance ? "persist" : "hold";

// --- builder ----------------------------------------------------------------

export const courseBuilderGraph = new StateGraph(CourseBuilderState)
	.addNode("classify_intent", classifyIntent)
	.addNode("revise_prior_field", revisePriorField)
	.addNode("tool_router", toolRouter)
	.addNode("tool_node", new ToolNode(allTools))
	.addNode("chat_response", chatResponse)
	.addNode("assess_completion", assessCompletion)
	.addNode("extract_step_data", extractStepData)
	.addNode("validate", validate)
	.addNode("confidence_score", confidenceScore)
	.addNode("clarify", clarify)
	.addNode("persist_and_emit", persistAndEmit)
	.addConditionalEdges(START, routeByMode, {
		chat: "classify_intent",
		finalize: "extract_step_data",
	})
	.addConditionalEdges("classify_intent", routeByIntent, {
		revise: "revise_prior_field",
		continue: "tool_router",
	})
	.addConditionalEdges("tool_router", routeAfterToolRouter, {
		use_tool: "tool_node",
		answer: "chat_response",
	})
	.addEdge("tool_node", "tool_router")
	.addEdge("chat_response", "assess_completion")
	.addEdge("revise_prior_field", "assess_completion")
	.addConditionalEdges("assess_completion", routeAfterAssess, {
		not_ready: END,
		ready: "extract_step_data",
	})
	.addEdge("extract_step_data", "validate")
	.addConditionalEdges("validate", routeAfterValidate, {
		pass: "confidence_score",
		fail: "clarify",
	})
	.addConditionalEdges("confidence_score", routeAfterConfidence, {
		persist: "persist_and_emit",
		hold: END,
	})
	.addEdge("clarify", END)
	.addEdge("persist_and_emit", END)
	.compile();
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean. If `ToolNode` is exported from `@langchain/langgraph/prebuilt`, confirm; otherwise import from `@langchain/langgraph` directly.

- [ ] **Step 3: Smoke-run the graph in chat mode**

Create `evals/courseAI/_smoke/graph.ts` (gitignored — add `evals/courseAI/_smoke/` to `.gitignore` in this step):

```ts
// evals/courseAI/_smoke/graph.ts
import { DraftStep } from "@/generated/prisma";
import { courseBuilderGraph } from "@/server/services/courseAI/graph/graph";

async function main() {
	const stream = courseBuilderGraph.streamEvents(
		{
			generationId: "smoke-gen-id",
			instructorId: "smoke-instructor-id",
			currentStep: DraftStep.basic,
			content: {},
			history: [],
			mode: "chat",
			userMessage: "I want to teach intermediate Python for data scientists.",
		},
		{ version: "v2" },
	);

	for await (const ev of stream) {
		if (ev.event === "on_chat_model_stream") {
			process.stdout.write((ev.data?.chunk?.content as string | undefined) ?? "");
		} else if (ev.event === "on_tool_start") {
			console.log(`\n[tool start] ${ev.name}`);
		} else if (ev.event === "on_chain_end" && ev.name === "assess_completion") {
			console.log(`\n[assess_completion] →`, ev.data?.output);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
```

Update `.gitignore`:
```
evals/courseAI/_smoke/
```

Run: `pnpm tsx --env-file=.env.local evals/courseAI/_smoke/graph.ts`
Expected: streams a chat response, prints `[tool start]` lines if the model decides to call any tool, ends with `[assess_completion] → { assessReady: ... }`. Will fail if `smoke-gen-id` doesn't exist in DB and `persist_and_emit` is reached — but for an empty first turn, `assess_completion` should return `not_ready` and END is reached without persisting.

- [ ] **Step 4: Commit**

```bash
git add server/services/courseAI/graph/graph.ts .gitignore
git commit -m "feat(courseAI): compile LangGraph StateGraph (11 nodes + tool node)"
```

---

### Task 20: Rewrite `CourseAIService`

**Files:**
- Modify: `server/services/courseAI/courseAI.service.ts` (full rewrite in place)

- [ ] **Step 1: Replace the service body**

```ts
// server/services/courseAI/courseAI.service.ts
import { TRPCError } from "@trpc/server";
import { type CourseGeneration, DraftStep } from "@/generated/prisma";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { courseGenerationMessageRepository } from "@/server/repositories/courseGenerationMessage.repository";
import { traced } from "@/server/services/_shared/tracing";
import { CourseAIError } from "@/server/services/courseAI/courseAI.errors";
import { courseBuilderGraph } from "@/server/services/courseAI/graph/graph";
import {
	isMessageShape,
	type MessageShape,
} from "@/server/services/courseAI/guards/isMessageShape";
import { logger } from "@/server/utils/logger";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

const HISTORY_LIMIT = 4;

export class CourseAIService {
	async getOrCreateCourseGeneration({
		courseGenerationId,
		userId,
	}: {
		courseGenerationId?: string;
		userId: string;
	}) {
		try {
			if (courseGenerationId) {
				const existing = await courseGenerationRepository.findFirst({
					where: { id: courseGenerationId, instructorId: userId },
				});
				if (existing) return existing;
			}
			return courseGenerationRepository.create({
				instructorId: userId,
				step: DraftStep.basic,
				content: {},
				status: "active",
			});
		} catch (error) {
			logger.error(error);
			throw new CourseAIError(
				"[Course AI service] failed to create course generation",
			);
		}
	}

	async saveMessage(generationId: string, message: MessageShape) {
		try {
			return await courseGenerationMessageRepository.create({
				generationId,
				role: message.role,
				content: message.content,
				step: message.step,
			});
		} catch (e) {
			logger.error(e);
			throw new CourseAIError("[Course AI service] Error saving message");
		}
	}

	private async hydrateState(args: {
		courseGeneration: CourseGeneration;
		userMessage: string;
		mode: "chat" | "finalize";
	}): Promise<CourseBuilderStateT> {
		const { courseGeneration: gen, userMessage, mode } = args;

		const lastMessages = await courseGenerationMessageRepository.findMany({
			where: { generationId: gen.id },
			orderBy: { createdAt: "desc" },
			take: HISTORY_LIMIT,
		});

		const history = lastMessages
			.reverse()
			.filter(isMessageShape)
			.map((m) => ({ role: m.role, content: m.content, step: m.step }));

		return {
			generationId: gen.id,
			instructorId: gen.instructorId,
			currentStep: gen.step,
			content: (gen.content as Record<string, unknown>) ?? {},
			history,
			mode,
			userMessage,
			intent: null,
			reviseTarget: null,
			toolCalls: [],
			assessReady: false,
			draftStepData: undefined,
			confidence: 0,
			shouldAutoAdvance: false,
			assistantText: "",
			validationErrors: null,
		};
	}

	async runChat({
		courseGeneration,
		userMessage,
		signal,
	}: {
		courseGeneration: CourseGeneration;
		userMessage: string;
		signal?: AbortSignal;
	}) {
		const initialState = await this.hydrateState({
			courseGeneration,
			userMessage,
			mode: "chat",
		});
		const run = traced(
			"courseAI.graph",
			async () =>
				courseBuilderGraph.streamEvents(initialState, {
					version: "v2",
					signal,
					configurable: { instructorId: courseGeneration.instructorId },
				}),
			{
				feature: "builder",
				userId: courseGeneration.instructorId,
				model: "gpt-4o-mini",
			},
		);
		return run();
	}

	async runFinalize({
		courseGeneration,
		signal,
	}: {
		courseGeneration: CourseGeneration;
		signal?: AbortSignal;
	}) {
		const initialState = await this.hydrateState({
			courseGeneration,
			userMessage: "",
			mode: "finalize",
		});
		const run = traced(
			"courseAI.graph",
			async () =>
				courseBuilderGraph.streamEvents(initialState, {
					version: "v2",
					signal,
					configurable: { instructorId: courseGeneration.instructorId },
				}),
			{
				feature: "builder",
				userId: courseGeneration.instructorId,
				model: "gpt-4o-mini",
			},
		);
		return run();
	}
}

export const courseAIService = new CourseAIService();
```

Notes:
- Both `runChat` and `runFinalize` return the stream from `streamEvents`. The route handler consumes the stream and emits SSE events.
- The legacy `streamChatResponse`, `extractStepData`, and `acceptStep` public methods are removed.
- `getOrCreateCourseGeneration` and `saveMessage` are kept verbatim — the route handler still calls them.

Search for stale callers that may now break: `grep -rn 'courseAIService\.\(streamChatResponse\|extractStepData\|acceptStep\)' .` — there should be exactly one match each in `app/api/chat/course/route.ts` (old) and `server/api/routers/ai.ts` (acceptStep). Both are updated in Tasks 21 and 22.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: type errors in `app/api/chat/course/route.ts` and `server/api/routers/ai.ts` only (they call the removed methods). Tasks 21 and 22 fix them.

- [ ] **Step 3: Commit**

```bash
git add server/services/courseAI/courseAI.service.ts
git commit -m "refactor(courseAI): replace LCEL methods with runChat/runFinalize over LangGraph"
```

---

### Task 21: Rewrite the SSE route handler

**Files:**
- Modify: `app/api/chat/course/route.ts` (full rewrite)
- Modify: `app/_components/Course/components/AIChatBuilderDialog/guards/isStreamEvent.ts`

- [ ] **Step 1: Update the stream-event type guard**

```ts
// app/_components/Course/components/AIChatBuilderDialog/guards/isStreamEvent.ts
import type { DraftStep } from "@/generated/prisma";

export type StreamEvent =
	| { type: "token"; value: string }
	| { type: "start"; courseGenerationId: string }
	| { type: "tool_call"; name: string; args: Record<string, unknown> }
	| { type: "confidence"; value: number }
	| {
			type: "step_committed";
			step: DraftStep;
			autoAdvanced: boolean;
			confidence: number;
	  }
	| { type: "error"; message: string }
	| { type: "done" };

export const isStreamEvent = (data: unknown): data is StreamEvent => {
	if (typeof data !== "object" || data === null) return false;
	if (!("type" in data)) return false;

	const event = data as Record<string, unknown>;

	switch (event.type) {
		case "token":
			return typeof event.value === "string";
		case "start":
			return typeof event.courseGenerationId === "string";
		case "tool_call":
			return typeof event.name === "string" && typeof event.args === "object";
		case "confidence":
			return typeof event.value === "number";
		case "step_committed":
			return (
				typeof event.step === "string" &&
				typeof event.autoAdvanced === "boolean" &&
				typeof event.confidence === "number"
			);
		case "error":
			return typeof event.message === "string";
		case "done":
			return true;
		default:
			return false;
	}
};
```

Note: the legacy `"actions"` event type is removed. Step 5 of this task updates the consumer.

- [ ] **Step 2: Rewrite the route handler**

```ts
// app/api/chat/course/route.ts
import type { DraftStep } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";
import { courseAIService } from "@/server/services/courseAI/courseAI.service";

export const runtime = "nodejs";

type Mode = "chat" | "finalize";

export async function POST(req: Request) {
	const session = await getSession();
	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const body = (await req.json()) as {
		courseGenerationId?: string;
		userMessage?: string;
		mode?: Mode;
	};
	const mode: Mode = body.mode === "finalize" ? "finalize" : "chat";

	if (mode === "chat" && !body.userMessage) {
		return new Response("Message is required", { status: 400 });
	}

	const abortSignal = req.signal;

	const courseGeneration = await courseAIService.getOrCreateCourseGeneration({
		courseGenerationId: body.courseGenerationId,
		userId: session.user.id,
	});

	if (mode === "chat" && body.userMessage) {
		await courseAIService.saveMessage(courseGeneration.id, {
			role: "user",
			content: body.userMessage,
			step: courseGeneration.step,
		});
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			const send = (data: unknown) => {
				if (abortSignal.aborted) return;
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
				);
			};

			let assistantFullText = "";
			let aborted = false;
			const onAbort = () => {
				aborted = true;
				try {
					controller.close();
				} catch {}
			};
			abortSignal.addEventListener("abort", onAbort);

			try {
				send({ type: "start", courseGenerationId: courseGeneration.id });

				const events =
					mode === "chat"
						? await courseAIService.runChat({
								courseGeneration,
								userMessage: body.userMessage ?? "",
								signal: abortSignal,
							})
						: await courseAIService.runFinalize({
								courseGeneration,
								signal: abortSignal,
							});

				let lastConfidence: number | null = null;

				for await (const ev of events) {
					if (abortSignal.aborted) {
						aborted = true;
						break;
					}

					if (ev.event === "on_chat_model_stream") {
						const chunk = ev.data?.chunk as { content?: unknown } | undefined;
						const token = chunk?.content?.toString();
						if (token) {
							assistantFullText += token;
							send({ type: "token", value: token });
						}
					} else if (ev.event === "on_tool_start") {
						send({
							type: "tool_call",
							name: ev.name,
							args: (ev.data?.input ?? {}) as Record<string, unknown>,
						});
					} else if (
						ev.event === "on_chain_end" &&
						ev.name === "confidence_score"
					) {
						const out = ev.data?.output as
							| { confidence?: number }
							| undefined;
						if (typeof out?.confidence === "number") {
							lastConfidence = out.confidence;
							send({ type: "confidence", value: out.confidence });
						}
					} else if (
						ev.event === "on_chain_end" &&
						ev.name === "persist_and_emit"
					) {
						// persistAndEmit has committed. ev.data.input is the state
						// snapshot at entry to the node, which contains the step
						// that was just committed.
						const state = (ev.data?.input ?? {}) as Partial<{
							currentStep: DraftStep;
							shouldAutoAdvance: boolean;
							mode: Mode;
							confidence: number;
						}>;
						if (state.currentStep) {
							send({
								type: "step_committed",
								step: state.currentStep,
								autoAdvanced:
									state.mode === "chat" && state.shouldAutoAdvance === true,
								confidence: lastConfidence ?? state.confidence ?? 0,
							});
						}
					}
				}

				if (!aborted && assistantFullText) {
					await courseAIService.saveMessage(courseGeneration.id, {
						role: "assistant",
						content: assistantFullText,
						step: courseGeneration.step,
					});
				}
				if (!aborted) send({ type: "done" });
			} catch (e) {
				if (!abortSignal.aborted) {
					console.error("[Course AI stream error]", e);
					send({ type: "error", message: "Failed to generate AI response" });
				}
			} finally {
				abortSignal.removeEventListener("abort", onAbort);
				try {
					controller.close();
				} catch {}
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean for `route.ts`; `server/api/routers/ai.ts` still errors (Task 22).

- [ ] **Step 4: Commit**

```bash
git add app/api/chat/course/route.ts app/_components/Course/components/AIChatBuilderDialog/guards/isStreamEvent.ts
git commit -m "feat(courseAI): SSE route maps LangGraph events; adds tool_call/confidence/step_committed"
```

---

### Task 22: Replace tRPC `acceptStep` with SSE-finalize on the client

**Files:**
- Modify: `server/api/routers/ai.ts`
- Modify: `app/_components/Course/components/AIChatBuilderDialog/hooks/useCommitCourseStep.ts`
- Modify: `app/_components/Course/components/AIChatBuilderDialog/hooks/useCourseStepFlow.ts`

The current finalize path is a tRPC mutation. Per the spec, finalize now runs through the same SSE endpoint with `mode: "finalize"` so it can emit `confidence` / `step_committed` (and stream a `clarify` response on validation failure).

- [ ] **Step 1: Remove `acceptStep` from the tRPC router**

```ts
// server/api/routers/ai.ts
import { TRPCError } from "@trpc/server";
import type { CourseGenerationWithRelations } from "@/prisma/zod";
import { createTRPCRouter, instructorProcedure } from "@/server/api/trpc";
import type { CourseSchemaOutput } from "@/server/entities/course";
import {
	processStepSchema,
	UpdateCourseGenerationStatusSchema,
} from "@/server/entities/course";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const courseAIRouter = createTRPCRouter({
	getGenerationStatus: instructorProcedure
		.input(processStepSchema)
		.query(async ({ input }) => {
			try {
				const courseGen = await courseGenerationRepository.findOne(
					input.courseGenerationId,
				);
				return {
					currentStep: courseGen?.step,
					sectionsData: courseGen?.content
						? (courseGen?.content as unknown as CourseSchemaOutput)
						: {},
				};
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getActiveCourseGeneration: instructorProcedure.query(async ({ ctx }) => {
		try {
			const data = await courseGenerationRepository.findFirst({
				where: { instructorId: ctx.session.user.id, status: "active" },
				orderBy: { createdAt: "desc" },
				include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
			});
			return data as CourseGenerationWithRelations;
		} catch (error) {
			handleServiceError(error);
		}
	}),

	setCourseGenerationStatus: instructorProcedure
		.input(UpdateCourseGenerationStatusSchema)
		.mutation(async ({ ctx, input }) => {
			const entity = await courseGenerationRepository.findFirst({
				where: { id: input.id, instructorId: ctx.session.user.id },
			});
			if (!entity) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Course generation not found",
				});
			}
			try {
				return await courseGenerationRepository.update(input.id, {
					status: input.status,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
```

(`acceptStep` is gone; the import of `courseAIService` is also removed.)

- [ ] **Step 2: Replace `useCommitCourseStep` with an SSE-finalize fetch**

Open `app/_components/Course/components/AIChatBuilderDialog/hooks/useCommitCourseStep.ts` and replace its body with a thin wrapper that POSTs to `/api/chat/course` with `mode: "finalize"`. The new shape returns nothing useful — the caller listens to the SSE stream that `useChatStreaming` is already consuming for chat-mode turns. We'll reuse `streamAssistantMessage` for finalize as well.

```ts
// app/_components/Course/components/AIChatBuilderDialog/hooks/useCommitCourseStep.ts
// Removed — finalize is now driven through useChatStreaming with mode="finalize".
```

Delete the file:
```bash
git rm app/_components/Course/components/AIChatBuilderDialog/hooks/useCommitCourseStep.ts
```

- [ ] **Step 3: Update `useChatStreaming` to accept a mode parameter**

```ts
// app/_components/Course/components/AIChatBuilderDialog/hooks/useChatStreaming.ts
import { useRef } from "react";
import { toast } from "sonner";
import { isAbortError } from "@/lib/guards/isAbortError";
import { isStreamEvent, type StreamEvent } from "../guards/isStreamEvent";
import type { Message } from "../types";

type StreamPayload = {
	mode: "chat" | "finalize";
	courseGenerationId?: string;
	userMessage?: string;
};

type Callbacks = {
	updateMessage: (id: string, updater: (m: Message) => Message) => void;
	setCourseGenerationId: (id: string) => void;
	onStreamEvent?: (ev: StreamEvent) => void;
};

export const useChatStreaming = (cb: Callbacks) => {
	const { updateMessage, setCourseGenerationId, onStreamEvent } = cb;
	const abortRef = useRef<AbortController | null>(null);

	const stream = async (payload: StreamPayload, messageId: string) => {
		abortRef.current?.abort();
		abortRef.current = new AbortController();

		try {
			const res = await fetch("/api/chat/course", {
				method: "POST",
				body: JSON.stringify(payload),
				signal: abortRef.current.signal,
			});
			if (!res.body) return;

			let buffer = "";
			const reader = res.body.getReader();
			const td = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += td.decode(value, { stream: true });

				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const parsed = JSON.parse(line.replace("data: ", ""));
					if (!isStreamEvent(parsed)) return;

					onStreamEvent?.(parsed);

					if (parsed.type === "token") {
						updateMessage(messageId, (m) => ({
							...m,
							content: m.content + parsed.value,
						}));
					}
					if (parsed.type === "start") {
						setCourseGenerationId(parsed.courseGenerationId);
					}
					if (parsed.type === "error") {
						toast.error(parsed.message);
					}
				}
			}
		} catch (e) {
			if (isAbortError(e)) return;
			if (e instanceof Error) {
				console.error("Streaming error", e);
				toast.error(e.message);
				return;
			}
			console.error("Unknown streaming error", e);
			toast.error("Streaming error");
		} finally {
			updateMessage(messageId, (m) => ({ ...m, isStreaming: false }));
		}
	};

	return {
		streamAssistantMessage: (
			payload: { userMessage: string; courseGenerationId?: string },
			messageId: string,
		) =>
			stream(
				{
					mode: "chat",
					userMessage: payload.userMessage,
					courseGenerationId: payload.courseGenerationId,
				},
				messageId,
			),
		streamFinalize: (
			payload: { courseGenerationId: string },
			messageId: string,
		) =>
			stream(
				{ mode: "finalize", courseGenerationId: payload.courseGenerationId },
				messageId,
			),
	};
};
```

- [ ] **Step 4: Simplify `useCourseStepFlow` — only kick off the finalize request**

Step advancement and completion-message playback are now driven exclusively by SSE events (`step_committed` → advance; `token` → bubble fills in; validation-fail path streams a clarify and does NOT advance). This hook just adds a placeholder assistant message and starts the stream.

```ts
// app/_components/Course/components/AIChatBuilderDialog/hooks/useCourseStepFlow.ts
import type { DraftStep } from "@/generated/prisma";
import type { Message } from "../types";
import { createAssistantMessage } from "../utils/messageFactory";

type UseCourseStepFlowProps = {
	addMessage: (message: Message) => void;
	courseGenerationId?: string;
	streamFinalize: (
		payload: { courseGenerationId: string },
		messageId: string,
	) => Promise<void>;
	onAssistantPlaceholder?: (id: string) => void;
};

export const useCourseStepFlow = ({
	addMessage,
	courseGenerationId,
	streamFinalize,
	onAssistantPlaceholder,
}: UseCourseStepFlowProps) => {
	const acceptStep = async (_step: DraftStep) => {
		if (!courseGenerationId) return;
		const assistantMessage = createAssistantMessage();
		addMessage(assistantMessage);
		onAssistantPlaceholder?.(assistantMessage.id);
		await streamFinalize({ courseGenerationId }, assistantMessage.id);
	};

	return { acceptStep };
};
```

Update the call site in `AIChatBuilderDialog/index.tsx` to remove `currentStep`, `setCurrentStep`, `setCompletedSteps`, `simulateTyping` from `useCourseStepFlow` props (the SSE handler in Task 23 owns those state updates now).

- [ ] **Step 5: Verify**

Run: `pnpm typecheck`
Expected: clean. If anything still imports the deleted `useCommitCourseStep`, grep and remove:
```bash
grep -rn 'useCommitCourseStep' app/ server/
```

- [ ] **Step 6: Commit**

```bash
git add server/api/routers/ai.ts app/_components/Course/components/AIChatBuilderDialog/hooks/
git commit -m "refactor(courseAI): finalize goes through SSE (mode=finalize); remove acceptStep tRPC mutation"
```

---

### Task 23: UI affordances — tool indicator, confidence badge, auto-advance pill

**Files:**
- Create: `app/_components/Course/components/AIChatBuilderDialog/components/Chat/ToolCallIndicator.tsx`
- Create: `app/_components/Course/components/AIChatBuilderDialog/components/Chat/ConfidenceBadge.tsx`
- Modify: `app/_components/Course/components/AIChatBuilderDialog/index.tsx`
- Modify: `app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatPanel.tsx` (or wherever the step indicator + Accept button live — verify with `grep -rn "showActions\|Accept" app/_components/Course/components/AIChatBuilderDialog/`)

- [ ] **Step 1: Add `ToolCallIndicator`**

```tsx
// app/_components/Course/components/AIChatBuilderDialog/components/Chat/ToolCallIndicator.tsx
const LABELS: Record<string, string> = {
	search_similar_courses: "Searching similar courses…",
	fetch_instructor_prior_courses: "Reviewing your prior courses…",
	validate_curriculum_coherence: "Checking curriculum coherence…",
	lookup_category_taxonomy: "Looking up categories…",
};

export const ToolCallIndicator = ({ name }: { name: string }) => {
	const label = LABELS[name] ?? `Calling ${name}…`;
	return (
		<div className="text-muted-foreground inline-flex animate-pulse items-center gap-2 text-xs">
			<span className="bg-muted-foreground h-1.5 w-1.5 rounded-full" />
			{label}
		</div>
	);
};
```

- [ ] **Step 2: Add `ConfidenceBadge`**

```tsx
// app/_components/Course/components/AIChatBuilderDialog/components/Chat/ConfidenceBadge.tsx
import { Badge } from "@/app/_components/_shared/ui/badge";

export const ConfidenceBadge = ({ value }: { value: number }) => {
	const pct = Math.round(value * 100);
	const tone = value >= 0.8 ? "default" : value >= 0.5 ? "secondary" : "outline";
	return <Badge variant={tone}>AI is {pct}% confident</Badge>;
};
```

- [ ] **Step 3: Wire SSE events into the dialog**

In `AIChatBuilderDialog/index.tsx`, hold three pieces of transient UI state:
- `activeToolCall: string | null` — set on `tool_call`, cleared on next `token` or `done`.
- `lastConfidence: number | null` — set on `confidence`, cleared on step change.
- `lastAutoAdvanced: boolean` — set on `step_committed.autoAdvanced`, used to swap Accept for a pill.

Update the `useChatStreaming` call site to pass an `onStreamEvent` callback:

```tsx
const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
const [lastConfidence, setLastConfidence] = useState<number | null>(null);
const [lastAutoAdvanced, setLastAutoAdvanced] = useState(false);

// Track the assistant placeholder created by useCourseStepFlow so we can fill
// it with the transition copy when finalize-mode commit yields no tokens.
const lastAssistantMessageIdRef = useRef<string | null>(null);

const { streamAssistantMessage, streamFinalize } = useChatStreaming({
	updateMessage,
	setCourseGenerationId,
	onStreamEvent: (ev) => {
		if (ev.type === "tool_call") setActiveToolCall(ev.name);
		else if (ev.type === "token") setActiveToolCall(null);
		else if (ev.type === "confidence") setLastConfidence(ev.value);
		else if (ev.type === "step_committed") {
			setLastAutoAdvanced(ev.autoAdvanced);

			// Advance UI step indicator.
			const committedIndex = STEPS.findIndex((s) => s.id === ev.step);
			if (committedIndex >= 0) {
				setCurrentStep(committedIndex + 1);
				setCompletedSteps((prev) =>
					prev.includes(ev.step) ? prev : [...prev, ev.step],
				);
			}

			// In finalize mode (autoAdvanced === false) no chat tokens were
			// streamed for this turn — fill the placeholder bubble with the
			// next-step transition copy. In chat-mode auto-advance the bubble
			// already contains the streamed chat_response.
			const nextStepId = STEPS[committedIndex + 1]?.id;
			const placeholderId = lastAssistantMessageIdRef.current;
			if (!ev.autoAdvanced && placeholderId) {
				const copy = nextStepId
					? STEP_MESSAGES[nextStepId] ??
						"Let's continue building your course."
					: "Your course draft is complete! You can review everything in the preview panel.";
				void simulateTyping(copy, placeholderId);
			}
		} else if (ev.type === "done") setActiveToolCall(null);
	},
});
```

In the call site, capture the placeholder id created inside `useCourseStepFlow.acceptStep` by exposing it (the easiest path: have `useCourseStepFlow` accept an `onAssistantPlaceholder?: (id: string) => void` callback and call it before `streamFinalize`). Wire it to `lastAssistantMessageIdRef.current = id`.

Pass `streamFinalize` into `useCourseStepFlow(...)` (its new prop, per Task 22).

- [ ] **Step 4: Render the new components in the chat panel**

Locate the chat-panel JSX inside `ChatPanel.tsx` and render the indicator/badge below the streaming message bubble. Locate the Accept button and swap it for an "Auto-advanced" pill when `lastAutoAdvanced` is true:

```tsx
{activeToolCall && <ToolCallIndicator name={activeToolCall} />}
{lastConfidence !== null && <ConfidenceBadge value={lastConfidence} />}

{showAcceptButton && !lastAutoAdvanced && (
	<Button onClick={...}>Accept Step</Button>
)}
{lastAutoAdvanced && (
	<Badge variant="default">Auto-advanced</Badge>
)}
```

(Exact placement depends on the existing JSX. Verify props/imports compile.)

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm check`
Expected: both clean.

- [ ] **Step 6: Smoke-test in a browser**

```bash
pnpm dev
```

Open the AI Builder dialog. Send: "I want to teach intermediate Python for data scientists, 6 hours, in English." Expect:
- A `Searching similar courses…` indicator may briefly appear.
- Tokens stream as today.
- Click Accept Step. Expect a confidence badge to appear and the step indicator to advance.

- [ ] **Step 7: Commit**

```bash
git add app/_components/Course/components/AIChatBuilderDialog/
git commit -m "feat(courseAI): UI indicators for tool calls, confidence, auto-advance"
```

---

## Phase E — LangSmith evals

### Task 24: Eval dataset format and runner skeleton

**Files:**
- Modify: `evals/runEvals.ts`
- Create: `evals/datasets/courseAI/classifyIntent.jsonl`
- Create: `evals/datasets/courseAI/assessCompletion.jsonl`
- Create: `evals/datasets/courseAI/extractStepData.jsonl`
- Create: `evals/datasets/courseAI/confidenceScore.jsonl`

The existing `evals/runEvals.ts` is a stub. Replace with a switchable CLI that picks one eval at a time. Use the LangSmith SDK (`langsmith` is already in deps via `langsmith/traceable`).

- [ ] **Step 1: Add a runner**

```ts
// evals/runEvals.ts
import { runClassifyIntentEval } from "./courseAI/classifyIntent.eval";
import { runAssessCompletionEval } from "./courseAI/assessCompletion.eval";
import { runExtractStepDataEval } from "./courseAI/extractStepData.eval";
import { runConfidenceScoreEval } from "./courseAI/confidenceScore.eval";

const EVALS: Record<string, () => Promise<void>> = {
	"courseAI:classifyIntent": runClassifyIntentEval,
	"courseAI:assessCompletion": runAssessCompletionEval,
	"courseAI:extractStepData": runExtractStepDataEval,
	"courseAI:confidenceScore": runConfidenceScoreEval,
};

async function main() {
	const which = process.argv[2];
	if (!which || !(which in EVALS)) {
		console.log("Usage: pnpm eval <name>");
		console.log("Available:", Object.keys(EVALS).join(", "));
		process.exit(1);
	}
	await EVALS[which]!();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
```

- [ ] **Step 2: Create empty JSONL files (filled in later tasks)**

```bash
mkdir -p evals/datasets/courseAI
touch evals/datasets/courseAI/{classifyIntent,assessCompletion,extractStepData,confidenceScore}.jsonl
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: type errors because the eval files don't exist yet — that's the cue to do Tasks 25–28.

- [ ] **Step 4: Commit (after the eval files exist)**

Defer the commit until Task 28 so all four evals land together.

---

### Task 25: `classifyIntent` eval

**Files:**
- Create: `evals/courseAI/classifyIntent.eval.ts`
- Modify: `evals/datasets/courseAI/classifyIntent.jsonl`

- [ ] **Step 1: Populate the dataset**

Add 20 lines to `evals/datasets/courseAI/classifyIntent.jsonl`, one JSON object per line:

```json
{"id":"01","currentStep":"basic","history":[],"userMessage":"I want to teach Python","expected":{"intent":"continue","reviseTarget":null}}
{"id":"02","currentStep":"objectives","history":[{"role":"user","content":"Python for data scientists","step":"basic"}],"userMessage":"Add 'understand pandas'","expected":{"intent":"continue","reviseTarget":null}}
{"id":"03","currentStep":"requirements","history":[{"role":"user","content":"Beginner","step":"basic"}],"userMessage":"Actually change the level to advanced","expected":{"intent":"revise","reviseTarget":"basic"}}
{"id":"04","currentStep":"curriculum","history":[{"role":"user","content":"4 objectives set","step":"objectives"}],"userMessage":"Remove the objective about machine learning","expected":{"intent":"revise","reviseTarget":"objectives"}}
```

(Add 16 more covering each `revise <target>` and 5 ambiguous "continue" cases. The dataset is small enough to write by hand in one sitting; populate to 20 entries.)

- [ ] **Step 2: Write the eval runner**

```ts
// evals/courseAI/classifyIntent.eval.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluate } from "langsmith/evaluation";
import { classifyIntent } from "@/server/services/courseAI/graph/nodes/classifyIntent";
import { DraftStep } from "@/generated/prisma";

type Row = {
	id: string;
	currentStep: keyof typeof DraftStep;
	history: { role: "user" | "assistant"; content: string; step: keyof typeof DraftStep }[];
	userMessage: string;
	expected: { intent: "continue" | "revise"; reviseTarget: keyof typeof DraftStep | null };
};

const DATASET_PATH = resolve(
	process.cwd(),
	"evals/datasets/courseAI/classifyIntent.jsonl",
);

const loadDataset = (): Row[] =>
	readFileSync(DATASET_PATH, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Row);

export async function runClassifyIntentEval() {
	const data = loadDataset();
	const results = await Promise.all(
		data.map(async (row) => {
			const out = await classifyIntent({
				generationId: "eval",
				instructorId: "eval",
				currentStep: DraftStep[row.currentStep],
				content: {},
				history: row.history.map((h) => ({ ...h, step: DraftStep[h.step] })),
				mode: "chat",
				userMessage: row.userMessage,
				intent: null,
				reviseTarget: null,
				toolCalls: [],
				assessReady: false,
				draftStepData: undefined,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: "",
				validationErrors: null,
			});
			const ok =
				out.intent === row.expected.intent &&
				(out.reviseTarget ?? null) ===
					(row.expected.reviseTarget
						? DraftStep[row.expected.reviseTarget]
						: null);
			return { id: row.id, ok };
		}),
	);
	const accuracy = results.filter((r) => r.ok).length / results.length;
	console.log(`classifyIntent accuracy: ${(accuracy * 100).toFixed(1)}%`);
	console.log("Failures:", results.filter((r) => !r.ok).map((r) => r.id));
	if (accuracy < 0.85) {
		console.error("FAIL: classifyIntent accuracy below 0.85 threshold");
		process.exit(1);
	}
	// Optional: forward to LangSmith via `evaluate(...)` once a dataset is uploaded.
	void evaluate;
}
```

- [ ] **Step 3: Verify**

Run: `pnpm eval courseAI:classifyIntent`
Expected: prints accuracy and exits 0 if ≥ 0.85. Will require `OPENAI_API_KEY` set in `.env.local`.

- [ ] **Step 4: Defer commit until Task 28**

---

### Task 26: `assessCompletion` eval

**Files:**
- Create: `evals/courseAI/assessCompletion.eval.ts`
- Modify: `evals/datasets/courseAI/assessCompletion.jsonl`

- [ ] **Step 1: Populate the dataset (20 entries)**

Each entry: conversation history + currentStep + assistantText → expected `ready: boolean`. 10 "complete enough" + 10 "still needs more".

Example:
```json
{"id":"01","currentStep":"basic","history":[{"role":"user","content":"Teach Python for data scientists, 6 hours, English, intermediate","step":"basic"}],"assistantText":"Great. I have title, subtitle, level, language, duration. Ready to extract.","expected":{"ready":true}}
{"id":"02","currentStep":"basic","history":[{"role":"user","content":"Maybe something about Python","step":"basic"}],"assistantText":"Could you tell me more about the level and audience?","expected":{"ready":false}}
```

Populate to 20 lines.

- [ ] **Step 2: Write the eval runner**

Similar shape to Task 25, calling `assessCompletion` instead. Compute precision on `ready: true`:

```ts
// evals/courseAI/assessCompletion.eval.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessCompletion } from "@/server/services/courseAI/graph/nodes/assessCompletion";
import { DraftStep } from "@/generated/prisma";

type Row = {
	id: string;
	currentStep: keyof typeof DraftStep;
	history: { role: "user" | "assistant"; content: string; step: keyof typeof DraftStep }[];
	assistantText: string;
	expected: { ready: boolean };
};

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/courseAI/assessCompletion.jsonl",
);

export async function runAssessCompletionEval() {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const results = await Promise.all(
		rows.map(async (r) => {
			const out = await assessCompletion({
				generationId: "eval",
				instructorId: "eval",
				currentStep: DraftStep[r.currentStep],
				content: {},
				history: r.history.map((h) => ({ ...h, step: DraftStep[h.step] })),
				mode: "chat",
				userMessage: "",
				intent: "continue",
				reviseTarget: null,
				toolCalls: [],
				assessReady: false,
				draftStepData: undefined,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: r.assistantText,
				validationErrors: null,
			});
			return {
				id: r.id,
				predicted: out.assessReady ?? false,
				expected: r.expected.ready,
			};
		}),
	);

	const truePositives = results.filter((r) => r.predicted && r.expected).length;
	const falsePositives = results.filter((r) => r.predicted && !r.expected).length;
	const precision =
		truePositives + falsePositives === 0
			? 1
			: truePositives / (truePositives + falsePositives);

	console.log(`assessCompletion precision on ready=true: ${(precision * 100).toFixed(1)}%`);
	console.log("False positives:", results.filter((r) => r.predicted && !r.expected).map((r) => r.id));
	if (precision < 0.9) {
		console.error("FAIL: precision below 0.9 threshold");
		process.exit(1);
	}
}
```

- [ ] **Step 3: Verify**

Run: `pnpm eval courseAI:assessCompletion`
Expected: precision ≥ 0.9; exits 0.

- [ ] **Step 4: Defer commit until Task 28**

---

### Task 27: `extractStepData` eval

**Files:**
- Create: `evals/courseAI/extractStepData.eval.ts`
- Modify: `evals/datasets/courseAI/extractStepData.jsonl`

- [ ] **Step 1: Populate dataset (40 entries — 10 per DraftStep)**

Each row: history → expected key fields. Example for `basic`:

```json
{"id":"basic-01","currentStep":"basic","history":[{"role":"user","content":"Teach intermediate Python for data scientists, 6 hours, English","step":"basic"}],"keyFields":{"level":"Intermediate","language":"English","duration":"6 h"}}
```

For `objectives`: assert `objectives.length >= 4`. For `requirements`: `requirements.length >= 2`. For `curriculum`: `sections.length >= 1 && sections[0].lessons.length >= 1`.

- [ ] **Step 2: Write the eval runner**

```ts
// evals/courseAI/extractStepData.eval.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractStepData } from "@/server/services/courseAI/graph/nodes/extractStepData";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";
import { DraftStep } from "@/generated/prisma";

type Row = {
	id: string;
	currentStep: keyof typeof DraftStep;
	history: { role: "user" | "assistant"; content: string; step: keyof typeof DraftStep }[];
	keyFields: Record<string, unknown>;
};

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/courseAI/extractStepData.jsonl",
);

const keyFieldsMatch = (extracted: unknown, expected: Record<string, unknown>) => {
	const obj = extracted as Record<string, unknown>;
	if (expected.objectives) {
		const arr = obj.objectives as unknown[] | undefined;
		return Array.isArray(arr) && arr.length >= (expected.objectives as number);
	}
	if (expected.requirements) {
		const arr = obj.requirements as unknown[] | undefined;
		return Array.isArray(arr) && arr.length >= (expected.requirements as number);
	}
	if (expected.sectionsMin) {
		const arr = obj.sections as unknown[] | undefined;
		return Array.isArray(arr) && arr.length >= (expected.sectionsMin as number);
	}
	// default: every key in expected matches case-insensitively
	return Object.entries(expected).every(([k, v]) => {
		const actual = obj[k];
		return typeof actual === "string" && typeof v === "string"
			? actual.toLowerCase().includes(v.toLowerCase())
			: actual === v;
	});
};

export async function runExtractStepDataEval() {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const results = await Promise.all(
		rows.map(async (r) => {
			const out = await extractStepData({
				generationId: "eval",
				instructorId: "eval",
				currentStep: DraftStep[r.currentStep],
				content: {},
				history: r.history.map((h) => ({ ...h, step: DraftStep[h.step] })),
				mode: "finalize",
				userMessage: "",
				intent: null,
				reviseTarget: null,
				toolCalls: [],
				assessReady: false,
				draftStepData: undefined,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: "",
				validationErrors: null,
			});
			const schema = getValidatorForStep(DraftStep[r.currentStep]);
			const parsed = schema.safeParse(out.draftStepData);
			const ok = parsed.success && keyFieldsMatch(out.draftStepData, r.keyFields);
			return { id: r.id, ok, zod: parsed.success };
		}),
	);

	const pass = results.filter((r) => r.ok).length / results.length;
	console.log(`extractStepData pass rate: ${(pass * 100).toFixed(1)}%`);
	console.log("Failures:", results.filter((r) => !r.ok).map((r) => r.id));
	if (pass < 0.9) {
		console.error("FAIL: extractStepData below 0.9 threshold");
		process.exit(1);
	}
}
```

- [ ] **Step 3: Verify**

Run: `pnpm eval courseAI:extractStepData`
Expected: pass rate ≥ 0.9; exits 0.

- [ ] **Step 4: Defer commit until Task 28**

---

### Task 28: `confidenceScore` eval and Phase E commit

**Files:**
- Create: `evals/courseAI/confidenceScore.eval.ts`
- Modify: `evals/datasets/courseAI/confidenceScore.jsonl`

- [ ] **Step 1: Populate dataset (20 entries — 10 complete, 10 incomplete)**

Each row: history + extracted draftStepData + `expected.complete: boolean`. The eval runs `confidenceScore` and checks calibration: of rows where `score ≥ 0.8`, what fraction had `expected.complete: true`?

- [ ] **Step 2: Write the eval runner**

```ts
// evals/courseAI/confidenceScore.eval.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { confidenceScore } from "@/server/services/courseAI/graph/nodes/confidenceScore";
import { DraftStep } from "@/generated/prisma";

type Row = {
	id: string;
	currentStep: keyof typeof DraftStep;
	history: { role: "user" | "assistant"; content: string; step: keyof typeof DraftStep }[];
	draftStepData: unknown;
	expected: { complete: boolean };
};

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/courseAI/confidenceScore.jsonl",
);

export async function runConfidenceScoreEval() {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const results = await Promise.all(
		rows.map(async (r) => {
			const out = await confidenceScore({
				generationId: "eval",
				instructorId: "eval",
				currentStep: DraftStep[r.currentStep],
				content: {},
				history: r.history.map((h) => ({ ...h, step: DraftStep[h.step] })),
				mode: "chat",
				userMessage: "",
				intent: "continue",
				reviseTarget: null,
				toolCalls: [],
				assessReady: true,
				draftStepData: r.draftStepData,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: "",
				validationErrors: null,
			});
			return {
				id: r.id,
				score: out.confidence ?? 0,
				expected: r.expected.complete,
			};
		}),
	);

	const highConf = results.filter((r) => r.score >= 0.8);
	const completeAmongHigh = highConf.filter((r) => r.expected).length;
	const calibration =
		highConf.length === 0 ? 1 : completeAmongHigh / highConf.length;

	console.log(
		`confidenceScore calibration (score≥0.8 → complete): ${(calibration * 100).toFixed(1)}%`,
	);
	if (calibration < 0.85) {
		console.error("FAIL: calibration below 0.85 threshold");
		process.exit(1);
	}
}
```

- [ ] **Step 3: Verify all four evals**

```bash
pnpm eval courseAI:classifyIntent
pnpm eval courseAI:assessCompletion
pnpm eval courseAI:extractStepData
pnpm eval courseAI:confidenceScore
```

Expected: each prints its metric and exits 0.

- [ ] **Step 4: Commit all of Phase E together**

```bash
git add evals/
git commit -m "test(courseAI): add LangSmith evals for classify/assess/extract/confidence"
```

---

## Phase F — Documentation & final verification

### Task 29: Add ADR-016

**Files:**
- Create: `docs/adr/016-langgraph-course-builder.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-016: LangGraph for the AI Course Builder

## Status
Accepted (2026-05-22).

## Context
The course builder was a hand-rolled state machine over `DraftStep` running two
implicit LCEL chains per turn (chat stream + JSON extraction). It had no tool
use, no conditional branching, partial tracing, and no path to update earlier
fields without losing later progress.

## Decision
Replace `CourseAIService`'s LCEL implementation with a compiled LangGraph
`StateGraph` (Zod-defined state via `@langchain/langgraph/zod`). Eleven nodes,
four tools, two run modes (chat / finalize).

Specific decisions:
- **Single StateGraph** over supervisor-of-subgraphs. The four DraftSteps share
  90% of logic; per-step subgraphs would mostly duplicate. Step-specific
  behavior lives in prompts and Zod schemas, not in graph topology.
- **No PostgresSaver / checkpointer.** State is hydrated each request from
  the existing `CourseGeneration` + `CourseGenerationMessage` tables. This
  avoids dual sources of truth and matches the current persistence pattern.
- **Hard-coded 0.8 confidence threshold** for chat-mode auto-persist. The
  threshold is project-wide, not per-instructor.
- **`assess_completion` gates auto-persist.** A separate, cheap node decides
  whether to enter the extract/validate/confidence pipeline in chat mode.
  Without it, every chat turn would pay for a structured-output extraction
  call even when the conversation is clearly not done.
- **Tool errors return `{ error }` JSON** instead of throwing. `ToolNode`
  forwards the error message to the LLM as a normal tool reply, and the graph
  proceeds to `chat_response` without aborting.

## Consequences
+ Per-node LangSmith traces; observable graph execution.
+ Auto-advance reduces clicks for confident steps.
+ Revision path lets users edit earlier fields mid-conversation.
- Extra structured-output call (`classify_intent`) before each chat-mode turn
  begins streaming. Budget: ≤ 400 ms pre-stream.
- `assess_completion`, `extract_step_data`, `validate`, and `confidence_score`
  add post-stream latency but don't affect time-to-first-token.

## Alternatives considered
- Wrap existing LCEL methods in a thin LangGraph shell — too little learning
  value and barely uses LangGraph's strengths.
- Supervisor + per-step subgraphs — over-engineered for four linear steps that
  share most of their logic.
- LangGraph PostgresSaver — adds a second source of truth alongside the
  existing tables for marginal benefit.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/016-langgraph-course-builder.md
git commit -m "docs(adr): ADR-016 LangGraph for the AI course builder"
```

---

### Task 30: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the "AI course builder" paragraph**

Find the section in `CLAUDE.md` that begins with `### AI course builder` and rewrite as:

```markdown
### AI course builder
Streaming SSE endpoint at `app/api/chat/course/route.ts`. The endpoint accepts `mode: "chat" | "finalize"` in the request body — chat turns stream tokens; finalize calls commit the current step (and may stream a clarification on validation failure).

Under the hood, `CourseAIService` runs a single compiled `LangGraph StateGraph` (Zod state via `@langchain/langgraph/zod`) with eleven nodes:

`classify_intent → revise_prior_field | tool_router → [tool_node]* → chat_response → assess_completion → extract_step_data → validate → (clarify | confidence_score → persist_and_emit)`

Two run modes: **chat** (entry at `classify_intent`, may auto-persist when `assess_completion.ready === true` and `confidence_score >= 0.8`) and **finalize** (entry at `extract_step_data`, always persists on validation pass).

Four tools bound to the LLM in chat mode:
- `search_similar_courses(query, limit?)` — pgvector semantic search over published courses.
- `fetch_instructor_prior_courses()` — the instructor's own catalog (instructorId closed over at build time).
- `validate_curriculum_coherence(sections, level, objectives)` — sub-LLM judge; only bound during the curriculum step.
- `lookup_category_taxonomy()` — canonical category list from `lib/constants/courseCategories.ts`.

No LangGraph checkpointer; state is hydrated per request from `CourseGeneration` + `CourseGenerationMessage`. See ADR-016.

Frontend: `app/_components/Course/components/AIChatBuilderDialog/` — chat panel with a live preview panel, tool-call indicator, confidence badge, and auto-advance pill.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md AI course builder section for LangGraph"
```

---

### Task 31: Final verification gate

- [ ] **Step 1: Full lint + typecheck + build**

```bash
pnpm check && pnpm typecheck && pnpm build
```

Expected: all three clean.

- [ ] **Step 2: All four evals pass thresholds**

```bash
pnpm eval courseAI:classifyIntent && \
pnpm eval courseAI:assessCompletion && \
pnpm eval courseAI:extractStepData && \
pnpm eval courseAI:confidenceScore
```

Expected: all exit 0.

- [ ] **Step 3: Manual scenarios from `docs/specs/2026-05-22-langgraph-course-builder/validation.md`**

Run scenarios 1–7 in `pnpm dev`. Confirm each behaves as the spec validation document describes. Pay particular attention to:
- Scenario 2 (auto-advance with no Accept click)
- Scenario 4 (revision updates an earlier step's content)
- Scenario 5 (tool failure fallback — temporarily break `embeddingsService.embedQuery`)
- Scenario 6 (abort mid-stream — no assistant message persisted)

- [ ] **Step 4: Confirm LangSmith traces**

With `LANGSMITH_TRACING=true` in `.env.local`, drive one chat turn, then open LangSmith and verify a `courseAI.graph` run with per-node spans (`classify_intent`, `tool_router`, `tool_node`, `chat_response`, `assess_completion`, etc.).

- [ ] **Step 5: Final commit / merge readiness**

If any docs (`CLAUDE.md`, ADR) needed last-minute tweaks during manual scenarios, commit them. Otherwise the branch is ready for review.

```bash
git status   # expect: clean
git log --oneline -20   # expect: chronological story of Tasks 1..31
```

---

## Out-of-scope reminders

These are explicitly NOT part of this plan (per spec):
- Vitest or any unit-test runner.
- LangGraph PostgresSaver / checkpointer integration.
- Non-linear step navigation beyond forward + revise.
- Migrating other AI services (lessonAssistant, quizAI, etc.) to LangGraph.
- Azure OpenAI provider swap.
- UI redesign of the chat panel beyond the three additions in Task 23.

## Rollout

No feature flag. Cutover happens task-by-task; the existing builder remains green until Task 20 lands (`CourseAIService` rewrite). After that, Tasks 21–22 are the breaking changes — typecheck failures during that window are expected and documented.

The merge gate is the four LangSmith eval thresholds in Phase E plus the manual scenarios in validation.md.