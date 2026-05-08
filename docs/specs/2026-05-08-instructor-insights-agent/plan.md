# Plan: Instructor Insights Agent

## Implementation order

1. Tools (4) + schemas + review-summarisation sub-chain.
2. Agent + system prompt.
3. Service (one-shot, with semantic validation retry).
4. tRPC `askInsights` procedure.
5. UI: Insights tab + chat panel + finding cards.

This plan inherits the agent + tools layout from `server/services/quizAI/` (ADR-008).

---

## Step 1 — Tools

```ts
// server/services/insightsAI/tools/queryEnrollmentMetrics.tool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";

export const buildQueryEnrollmentMetricsTool = (instructorId: string) =>
  tool(
    async ({ courseId, dateRange }) =>
      enrollmentRepository.metricsForInstructor(instructorId, courseId, dateRange),
    {
      name: "query_enrollment_metrics",
      description: "Active/completed counts, average progress %, weekly enrollments. Filterable by courseId and dateRange.",
      schema: z.object({
        courseId: z.string().optional(),
        dateRange: z.object({ from: z.string(), to: z.string() }).optional(),
      }),
    },
  );
```

The `instructorId` is closed over at construction time. Even if the LLM passes a `courseId` that does not belong to the instructor, `metricsForInstructor` filters by `instructorId` server-side and returns an empty result.

`getAtRiskStudents`, `getLessonDropoffs` follow the same pattern. Each is ≤30 lines and delegates to a method on an existing repository (which is added if it does not already exist).

`summarizeReviews` is special: it embeds an LCEL sub-chain.

```ts
// server/services/insightsAI/tools/summarizeReviews.tool.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { courseReviewRepository } from "@/server/repositories/courseReview.repository";
import { ReviewSummarySchema } from "../schemas/reviewSummary.schema";

const summaryPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Group these course reviews into 3–6 themes (mix of positive and critical). For each theme, give a short title, a one-sentence description, and pick one verbatim sample quote (≤25 words). Also report sentiment distribution as percentages (positive / neutral / negative) over the whole set.`,
  ],
  ["human", "{reviews}"],
]);

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 })
  .withStructuredOutput(ReviewSummarySchema);

const summaryChain = summaryPrompt.pipe(llm);

export const buildSummarizeReviewsTool = (instructorId: string) =>
  tool(
    async ({ courseId, dateRange }) => {
      const reviews = await courseReviewRepository.forInstructor(
        instructorId,
        courseId,
        dateRange,
      );
      if (reviews.length === 0) {
        return { themes: [], sentimentDistribution: { positive: 0, neutral: 0, negative: 0 }, sampleQuotes: [] };
      }
      return summaryChain.invoke({
        reviews: reviews.map((r, i) => `Review ${i + 1} (rating ${r.rating}): ${r.comment}`).join("\n\n"),
      });
    },
    {
      name: "summarize_reviews",
      description: "Summarise course reviews into themes with sentiment distribution. Filterable by courseId and dateRange.",
      schema: z.object({
        courseId: z.string().optional(),
        dateRange: z.object({ from: z.string(), to: z.string() }).optional(),
      }),
    },
  );
```

The summary sub-chain is a small but explicit LCEL example *inside* a tool — the agent sees it as a single tool call.

---

## Step 2 — Agent

```ts
// server/services/insightsAI/insightsAI.agent.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { env } from "@/lib/env";
import { InsightsAnswerSchema } from "./schemas/insightsAnswer.schema";
import { buildAtRiskStudentsTool } from "./tools/getAtRiskStudents.tool";
import { buildEnrollmentMetricsTool } from "./tools/queryEnrollmentMetrics.tool";
import { buildLessonDropoffsTool } from "./tools/getLessonDropoffs.tool";
import { buildSummarizeReviewsTool } from "./tools/summarizeReviews.tool";

const SYSTEM = `You answer questions about an instructor's own courses. You have tools to query enrollment metrics, identify at-risk students, summarize reviews, and find lesson dropoffs. Always:

1. Pick the smallest set of tools that answers the question.
2. Cite specific numbers from tool results in your answer.
3. Output a structured response: a markdown answer string plus a findings array (one per concrete observation worth surfacing as a card).
4. Keep findings to the most important 3–5 points; never exceed 8.

Today's date: {today}.`;

const template = ChatPromptTemplate.fromMessages([["system", SYSTEM]]);

export async function createInsightsAgent(instructorId: string) {
  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.3,
    apiKey: env.OPENAI_API_KEY,
  });

  const systemPrompt = await template.format({ today: new Date().toISOString().slice(0, 10) });

  return createAgent({
    model: llm,
    tools: [
      buildEnrollmentMetricsTool(instructorId),
      buildAtRiskStudentsTool(instructorId),
      buildSummarizeReviewsTool(instructorId),
      buildLessonDropoffsTool(instructorId),
    ],
    systemPrompt,
    responseFormat: InsightsAnswerSchema,
  });
}
```

Per ADR-008: structured output via `responseFormat` (single call, no `JSON.parse`).

---

## Step 3 — Service

```ts
// server/services/insightsAI/insightsAI.service.ts
import { createInsightsAgent } from "./insightsAI.agent";
import { logger } from "@/server/utils/logger";

const MAX_ATTEMPTS = 2;

class InsightsAIService {
  async ask(instructorId: string, question: string) {
    const agent = await createInsightsAgent(instructorId);

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const result = await agent.invoke({
          messages: [{ role: "user", content: question }],
        });
        return result.structuredResponse;
      } catch (error) {
        logger.warn(`Insights attempt ${attempt + 1} failed`, error);
        lastError = error;
      }
    }
    throw lastError ?? new Error("Insights generation failed");
  }
}

export const insightsAIService = new InsightsAIService();
```

No conversation memory in v1 — the agent is created per request with the instructor's ID closed over its tools.

---

## Step 4 — tRPC procedure

```ts
// server/api/routers/ai.ts — add
askInsights: instructorProcedure
  .input(z.object({ question: z.string().min(3).max(500) }))
  .mutation(({ ctx, input }) =>
    insightsAIService.ask(ctx.session.user.id, input.question),
  ),
```

---

## Step 5 — UI

A new "Insights" tab on the instructor dashboard.

```
┌────────────────────────────────────────────────────────┐
│  My Courses  |  Students  |  Insights ●               │
│────────────────────────────────────────────────────────│
│                                                        │
│  Ask about your courses                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Which students are at risk in React Mastery?     │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  Answer                                                │
│  ─────────                                             │
│  Three students have not made progress in the last    │
│  14 days. Two are stalled on Section 3 — the lesson   │
│  on hooks consistently has the largest drop-off.      │
│                                                        │
│  ┌─[ at_risk_student ]──────────────────────────────┐ │
│  │ Sarah Lin — last active 18 days ago              │ │
│  │ Stuck on "useEffect deep dive". Send a check-in. │ │
│  └──────────────────────────────────────────────────┘ │
│  ┌─[ dropoff ]──────────────────────────────────────┐ │
│  │ Section 3 / Lesson 4 — 38 % drop                │ │
│  │ Consider adding a short recap before this lesson.│ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

The `findings[]` array is rendered as a vertical list of cards typed by `finding.type`. The shared `Card` component already exists in `app/_components/_shared/ui/`.

---

## Tracing & evals

`feature:insights` tag is added by the shared `traced` wrapper around `InsightsAIService.ask`. The agent's tool calls become child spans automatically.

A lightweight eval at `evals/datasets/insights.jsonl` exercises three canonical questions ("at-risk students", "review themes", "dropoffs") against a seeded test course with deterministic data. The judge confirms each answer references the expected tool and includes at least one `findings[]` entry of the expected `type`.
