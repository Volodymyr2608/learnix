# Validation: AI Course Builder

## Manual scenarios

Run the dev server (`pnpm dev`) and Prisma Studio (`pnpm db:studio`) side by side. Sign in as INSTRUCTOR.

### S1 — Happy path (all four steps)

1. Open the AI Course Builder dialog.
2. **Verify**: a new `CourseGeneration` row appears in Prisma Studio with `status = active`.
3. Chat through Step 1 (basic info) and click **Accept**.
4. **Verify**: `CourseGeneration.content` contains the extracted basic info; `step` advances to `objectives`.
5. Complete Steps 2–4 in the same way.
6. **Verify**: after Step 4, `status = completed` and the preview panel shows the full course draft.

### S2 — SSE event sequence

Using the browser network tab, inspect the event stream on `POST /api/chat/course`:

1. Send a user message.
2. **Verify** events arrive in order: `start` → one or more `token` → `actions` → `done`.
3. **Verify**: no event has `type: error` on a successful response.

### S3 — Resuming a session

1. Start a generation, complete Step 1, then close the dialog.
2. Reopen the dialog.
3. **Verify**: `getActiveCourseGeneration` returns the existing session; message history is restored; `currentStep` is at Step 2.

### S4 — Auth gates

| Action | Role | Expected |
|---|---|---|
| Open dialog | STUDENT | `FORBIDDEN` from `instructorProcedure` |
| POST to `/api/chat/course` with no session | anonymous | `401` |
| Call `courseAI.acceptStep` with no session | anonymous | `UNAUTHORIZED` |

### S5 — Step extraction accuracy

1. Complete Step 1 chat with clear course info.
2. Click **Accept** and inspect `CourseGeneration.content` in Prisma Studio.
3. **Verify**: all required fields (title, subtitle, description, category, level, language, duration, price) are present and match what was discussed in chat.
