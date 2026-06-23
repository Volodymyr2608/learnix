# Validation: Direct Messages (Student ↔ Instructor)

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean (no nested ternaries in the sidebar badge logic; no hardcoded `"2"`/`"3"` badges remain).
- `pnpm test:unit` and `pnpm test:integration` — green (three new integration files).
- `pnpm build` — both `/dashboard/messages` and `/instructor/messages` routes compile.

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `messaging.dto.sendMessageInput`: rejects an empty/whitespace body (`"   "` → parse error) and a body over 2000 chars; trims surrounding whitespace on a valid body. (Optional — schema is Zod; covered indirectly by the router input parse.)
- No other pure-logic units: the feature's logic is DB-bound and covered by integration tests below.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

- `ConversationRepository.getOrCreate`: two calls with the same `(student, instructor, course)` return the same row; exactly one `conversations` row exists (FR5 idempotency).
- `ConversationRepository.findForUser`: returns threads newest-first (`lastMessageAt` desc) with `otherParticipantName`, `courseTitle`, last-message `lastMessagePreview`, and `unreadCount` computed for the viewer (FR1, FR8).
- `MessageRepository.createWithBump`: persists the message and advances `conversation.lastMessageAt` in one transaction (FR6, inbox ordering).
- `MessageRepository.markReadFor` + `getTotalUnreadForUser`: `markReadFor` clears only messages where `senderId != viewer AND readAt IS NULL`; unread counts are per-viewer and the sender's own message stays unread for the other party (FR7, FR8).
- `MessagingService.getOrCreateConversation`: succeeds for an enrolled student; **rejects** when no non-cancelled enrollment links the student to the course (FR11); instructor caller must own the course and pass `studentId`.
- `MessagingService.send/getThread/getUnreadCount`: full round-trip — student sends, instructor sees `unreadCount === 1` and the message as `isMine: false`, `markRead` zeroes the count (FR2, FR6, FR7, FR8).
- `MessagingService.getThread` IDOR: a user who is neither `studentId` nor `instructorId` is rejected (`FORBIDDEN`/`NOT_FOUND`) and receives no thread data (FR10).

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (inbox list) | `ConversationRepository.findForUser` test; Manual #1, #4 |
| FR2 (thread view) | `MessagingService.send/getThread` test; Manual #2 |
| FR3 (student starts thread) | `getOrCreateConversation` enrolled test; Manual #1 |
| FR4 (instructor starts thread) | `getOrCreateConversation` instructor-path test; Manual #5 |
| FR5 (uniqueness) | `getOrCreate` idempotency test; Edge case "duplicate/race" |
| FR6 (send composer) | `createWithBump` test + `sendMessageInput` unit; Manual #2 |
| FR7 (read state) | `markReadFor` test; Manual #3 |
| FR8 (unread count) | `getTotalUnreadForUser` test; Manual #3 |
| FR9 (polling refresh) | Manual #3 (reply appears within ~10s without refresh) |
| FR10 (participant authz / IDOR) | `getThread` IDOR test; Edge case "permission boundary" |
| FR11 (enrollment gate) | `getOrCreateConversation` not-enrolled test; Edge case "cancelled enrollment" |
| FR12 (sidebar badge) | Manual #3 (badge tracks real unread); automated `pnpm check` (no hardcoded badge) |
| FR13 (email on new message) | Manual #6; Edge case "email dedup window" |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d        # postgres on 5433
pnpm db:migrate             # apply the add_messaging migration
pnpm dev                    # app on http://localhost:3000
# Two browser profiles/incognito: one signed in as a STUDENT, one as an INSTRUCTOR.
# The student must be ENROLLED in a course owned by that instructor (enroll via the app first).
# For FR13 email: a valid RESEND_API_KEY + EMAIL_FROM_ADDRESS, and check the recipient inbox / Resend dashboard.
```

1. **Student starts a conversation:** As the student, open My Courses → an enrolled course card → click **Message instructor**. Expected: redirected to `/dashboard/messages?c=<id>`, the thread opens with the instructor's name + course title, inbox shows the new (empty) conversation. Click **Message instructor** again on the same course → reopens the **same** thread (URL `c` unchanged, no second inbox row).

2. **Student sends a message:** In the open thread, type "Question about lesson 3" and press Enter (or Send). Expected: the message appears immediately, right-aligned (mine), composer clears. An empty/whitespace-only send does nothing (Send disabled).

3. **Instructor receives, badge, read, polling reply:** As the instructor (already on the dashboard), within ~15s the sidebar **Messages** badge shows `1` (real count, not a hardcoded value). Open `/instructor/messages`, select the conversation. Expected: the student's message shows left-aligned (not mine); the sidebar badge drops to none after opening (marked read). Reply "See the hooks section". Switch to the student's still-open thread → the reply appears within ~10s **without a manual refresh** (left-aligned), and the student's sidebar badge increments.

4. **Inbox ordering & previews:** With multiple conversations, send a message in the older one. Expected: that conversation jumps to the top of the inbox (most-recent-active first); each row shows other participant, course title, last-message preview, and an unread pill when applicable.

5. **Instructor starts a conversation:** As the instructor, open Students → a student's details dialog → click **Message**. Expected: redirected to `/instructor/messages?c=<id>` for that `(student, instructor, course)` thread; reopening hits the same thread.

6. **Email notification:** Trigger a new message to a recipient who is not actively reading. Expected: the recipient receives one "New message from <sender>" email (templateKey `message.new`) with the course title, a preview, and a **Reply** link to the correct messages page (`/dashboard/messages` for a student recipient, `/instructor/messages` for an instructor). Sending several messages in the same thread within 5 minutes produces **at most one** email (dedup bucket).

## Edge cases & regression

- **Permission boundary (IDOR):** a signed-in user calls `message.getThread` / `message.send` / `message.markRead` with a `conversationId` they are not a participant of → `FORBIDDEN`, no data leaked. (Integration test + can be reproduced by editing the `?c=` id in the URL to a foreign conversation → "Select a conversation"/error, no messages.)
- **Cancelled enrollment:** student whose enrollment status is `cancelled` cannot start a conversation (`getOrCreateConversation` → `FORBIDDEN`). Existing threads still readable is acceptable (not gated on re-read), but no new thread is created.
- **Duplicate / race:** two near-simultaneous `getOrCreateConversation` calls for the same triple create exactly one conversation (DB `@@unique` + re-read on `P2002`).
- **Empty states:** a user with no conversations sees "No conversations yet."; no conversation selected shows "Select a conversation"; a thread with no messages renders the header + composer only.
- **Unread accuracy:** opening a thread marks only messages addressed to the viewer as read; the viewer's own just-sent messages never count as unread for themselves.
- **Polling load:** background tabs do not poll (`refetchIntervalInBackground` left default false); intervals are 10s (thread) / 15s (inbox + badge).
- **XSS:** a message body containing `<script>` or HTML renders as literal text (React escaping), never as markup.
- **Regression — sidebar:** instructor reviews badge still reflects `reviewsCount` (the badge refactor must not break the existing reviews badge); both `/dashboard/messages` and `/instructor/messages` no longer 404.

## Definition of done

- [ ] All automated checks green; new code covered by unit + integration tests.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All manual scenarios (#1–#6) pass.
- [ ] Risks in `spec.md` mitigated or accepted: polling load (interval + background-pause), email storm (5-min dedup bucket), duplicate conversations (unique + re-read), unread drift (recompute on poll).
- [ ] Docs updated where warranted: a "Direct messages" section in `CLAUDE.md` (router, models, polling, email template); roadmap entry marked delivered. No ADR required (no new architectural decision beyond reusing established patterns).