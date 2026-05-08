# Validation: Instructor Insights Agent

## Automated checks

| Command | Expectation |
|---|---|
| `pnpm typecheck` | No errors. |
| `pnpm check` | No lint or format issues. |
| `pnpm build` | Production build succeeds. |
| `pnpm eval` (after dataset is added) | All three canonical questions score above the threshold. |

## Manual scenarios

Run `pnpm dev`. Sign in as INSTRUCTOR with at least one course that has enrollments, reviews (mix of ratings), and lesson progress data. Seed if necessary.

### S1 — At-risk students

1. Open the Insights tab.
2. Ask: `Which students are at risk of dropping off?`
3. **Verify**: spinner; within ~10 s, an answer plus 1+ `at_risk_student` cards appear.
4. **Verify** in server log: `get_at_risk_students` tool call is logged; no other instructor's data is returned.

### S2 — Review themes

1. Ask: `Summarise complaints from the last 30 days of reviews.`
2. **Verify**: answer mentions specific themes; cards of type `review_theme` appear with sample quotes.
3. **Verify** in server log: `summarize_reviews` tool call is logged with `dateRange` matching the last 30 days.

### S3 — Lesson dropoffs

1. Ask: `Where in section 3 do students stop?`
2. **Verify**: answer cites a specific lesson; a `dropoff` card appears.
3. **Verify** in server log: `get_lesson_dropoffs` tool call is logged with the correct `courseId`.

### S4 — Cross-instructor data isolation

1. Sign in as a DIFFERENT instructor (instructor B).
2. Open the Insights tab.
3. Ask the same question as in S1, but the answer should not include any of instructor A's students.
4. (Bonus) Manually craft a tRPC call from instructor B's session passing a `courseId` that belongs to instructor A.
5. **Verify**: tool returns empty result; the agent's answer says "no data" — no leakage.

### S5 — Authorization

| Action | Role | Expected |
|---|---|---|
| Call `ai.askInsights` | anonymous | `UNAUTHORIZED` |
| Call `ai.askInsights` | STUDENT | `FORBIDDEN` (instructorProcedure) |
| Call `ai.askInsights` with empty question | INSTRUCTOR | `BAD_REQUEST` (Zod min length) |

### S6 — Response shape

1. Use the chat panel to ask any valid question.
2. Open browser devtools network tab.
3. **Verify** the tRPC response contains `answer: string` and `findings: [...]`, and that `findings[].type` is one of the schema's enum values.

### S7 — Retry on transient failure

1. Inject a one-time error into a tool (e.g., temporarily throw inside `get_at_risk_students` once).
2. Ask the question.
3. **Verify** server log shows attempt 1 failed, attempt 2 succeeded; the user sees a normal answer.

### S8 — LangSmith tracing

1. With `LANGSMITH_TRACING=true`, ask any question.
2. **Verify** in LangSmith UI: a run named `insightsAI.ask` with tag `feature:insights` and `userId:<id>` is logged.
3. **Verify**: the trace tree shows tool calls and (for `summarize_reviews`) a nested LCEL sub-chain span.
