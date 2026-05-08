# Requirements: Instructor Insights Agent

## Status: planned — Phase 9

## Problem

The instructor portal (`app/instructor/page.tsx`, `app/instructor/students/page.tsx`) shows static / placeholder data and offers no exploratory analytics. Instructors who want answers like "which students are stalling?", "what are recent reviews complaining about?", or "where in section 3 do students drop off?" have no UI for those questions and no way to phrase them in natural language.

A natural-language agent (per ADR-008) over the instructor's own course data turns vague intent into structured answers — and into action cards the UI can render.

## Goal

The instructor opens an "Ask about your courses" chat panel on the dashboard. They ask questions in natural language; the agent calls typed tools backed by existing repositories; it returns a markdown answer plus a list of structured `findings[]` that the UI renders as action cards.

## Architectural decisions

- ADR-008 — agent + tools + structured output (`responseFormat`).
- ADR-004 — `instructorProcedure` enforces the role at the tRPC layer; tools enforce ownership server-side regardless of LLM-supplied IDs (defence in depth).
- ADR-013 — every agent run is traced with `feature:insights`.

## Functional requirements

| Surface | Behaviour |
|---|---|
| Instructor dashboard | New "Insights" tab containing a chat panel. |
| Question input | Free text; optional course filter (defaults to "all my courses"). |
| Response | Markdown prose answer + `findings[]` rendered as cards (one per finding). |
| Tool isolation | Every tool filters results by `instructorId = ctx.session.user.id`, even if the LLM passes a different `instructorId` argument. |
| Persistence | Conversation is **not** persisted in v1. One-shot Q&A. |
| Streaming | Not in v1; one-shot response. Streaming is a future enhancement. |

## Tools

| Tool | Inputs | Output |
|---|---|---|
| `query_enrollment_metrics` | `courseId?`, `dateRange?` | Counts (active, completed), avg progress %, completion rate, weekly enrollments. |
| `get_at_risk_students` | `courseId?`, `staleDays = 14` | List of `{ studentId, courseId, lastActivityAt, progress }` for students with no `LessonProgress` updates in the last N days and progress < 100%. |
| `summarize_reviews` | `courseId?`, `dateRange?` | LCEL sub-chain over `CourseReview` rows: returns `{ themes: string[], sentimentDistribution, sampleQuotes }`. |
| `get_lesson_dropoffs` | `courseId` | Ordered list of lessons by completion-rate gap to the previous lesson; flags the lesson where most students stop. |

Each tool is a typed `tool()` (per ADR-008). Inputs are validated by Zod schemas; outputs are JSON the agent can fold into the final answer.

## Output schema

```ts
const InsightsAnswerSchema = z.object({
  answer: z.string().min(20),       // markdown prose
  findings: z
    .array(
      z.object({
        type: z.enum(["at_risk_student", "review_theme", "dropoff", "metric"]),
        title: z.string(),
        evidence: z.string(),       // markdown
        action: z.string().optional(), // suggested next step
      }),
    )
    .max(8),
});
```

## Files to create / modify

| Action | Path |
|---|---|
| New service | `server/services/insightsAI/insightsAI.service.ts` |
| New agent | `server/services/insightsAI/insightsAI.agent.ts` |
| New tools | `server/services/insightsAI/tools/queryEnrollmentMetrics.tool.ts` |
| New tools | `server/services/insightsAI/tools/getAtRiskStudents.tool.ts` |
| New tools | `server/services/insightsAI/tools/summarizeReviews.tool.ts` (uses an LCEL sub-chain) |
| New tools | `server/services/insightsAI/tools/getLessonDropoffs.tool.ts` |
| New schemas | `server/services/insightsAI/schemas/...` |
| New errors | `server/services/insightsAI/insightsAI.errors.ts` |
| Modify | `server/api/routers/ai.ts` — add `askInsights` |
| Modify | instructor dashboard page — add Insights tab |
| New component | `app/_components/Instructor/components/InsightsChat/` |

## Estimated effort

| Task | Time |
|---|---|
| Tool implementations (4) | 4 h |
| Review-summarisation sub-chain | 1 h |
| Agent + system prompt + structured output | 1.5 h |
| Service + retry / validation loop | 1 h |
| tRPC procedure | 0.5 h |
| Insights tab + chat UI + finding cards | 3 h |
| **Total** | **~1.5 days** |

## Out of scope

- Streaming the answer. v1 is one-shot.
- Conversation memory across messages. v1 is one-shot per question.
- Cross-instructor benchmarks ("how does my completion rate compare?"). Future after we have a richer dataset.
- Automated outreach actions. Action suggestions are surfaced as text only; the instructor does the outreach manually.

## Future extensions

- **Streaming** — switch to `agent.streamEvents()` over SSE once the answer schema stabilises.
- **Conversation memory** — persist the last N turns per instructor for follow-up questions.
- **Action buttons** — turn `action` strings into one-click actions ("Send re-engagement email", "Add a Q&A note to lesson X").
- **Slack digest** — schedule a weekly insights summary via the LangSmith-tagged agent.
