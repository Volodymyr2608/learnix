# Requirements: Direct Messages (Student ↔ Instructor)

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned

Date: 2026-06-23 · Author: Volodymyr Pelykh · Stakeholder: Volodymyr Pelykh

## Problem

The sidebar already advertises a **Messages** entry for both students and instructors
(`app/_components/Dashboard/Sidebar/components/Navigation/index.tsx:69` and `:108`), complete with
**hardcoded** unread badges (`"2"` / `"3"`). Both links point at routes that do not exist
(`STUDENT_URLS.messages` → `/dashboard/messages`, and `/instructor/messages`), so today they 404.
There is no `Message`/`Conversation` schema, router, service, or page anywhere in the codebase.

The result is a dead, misleading feature in the live Vercel app: a nav item with a fake count that
links nowhere. Students enrolled in a course currently have **no in-app way to ask the instructor a
question**, and instructors have no way to reply — the only channel is email outside the platform.

## Goal

- A student enrolled in a course can start a private conversation with that course's instructor and
  exchange messages, both directions, entirely in-app.
- An instructor can see and reply to messages from their enrolled students, organised by course.
- The sidebar **Messages** badge reflects the viewer's **real** unread count, not a hardcoded value.
- New messages are delivered without a manual page refresh (near-real-time via polling) and notify
  the recipient by email when they are away.
- The feature reuses the existing router → service → repository layering, enrollment-based
  authorization, and Resend notification plumbing — no new infrastructure.

## Scope decisions (locked)

1. **1-on-1, not group chat:** conversations are strictly between one student and one instructor.
   Group/course-wide rooms are rejected — they become a noisy forum (inactive students, moderation,
   privacy, notification spam) and a much larger feature.
2. **Per-course threads:** a conversation is keyed by `(student, instructor, course)`. A student who
   took two courses from the same instructor gets two threads. Rationale: gives the instructor
   context ("which course is this about?") and maps one-to-one onto the enrollment that authorizes
   the conversation.
3. **Both directions:** either participant may send the first message and reply. Permission to
   message is the enrollment itself — a student may only message instructors of courses they are
   enrolled in; an instructor may only message students enrolled in their own course.
4. **Polling, not WebSockets:** Vercel serverless cannot hold persistent sockets. The open thread and
   unread counts refresh on a client poll interval. (SSE/realtime services are out of scope.)
5. **Email on new message:** reuse `notificationService` + Resend + `NotificationLog` dedup
   (fire-and-forget, like certificate/progress emails) to email the recipient. Send failure never
   blocks the message write.
6. **Reuse existing layering & badge pattern:** new `message` tRPC router (composed in
   `server/api/root.ts`), service + repositories extending `BaseRepository`, and a real unread count
   wired into the sidebar exactly like the existing `reviewsCount` flow
   (`app/_components/Dashboard/Sidebar/index.tsx:19`).

## Assumptions & constraints

- Both participants are existing platform users with roles `STUDENT` / `INSTRUCTOR`; an instructor is
  identified via `Course.instructorId`.
- Authorization derives from `Enrollment` (`enrollmentRepository.findByStudentCourse`). Any enrolled
  status (`active` or `completed`) permits messaging; `cancelled` does not.
- Text-only messages for v1 (no attachments, images, or rich text).
- A conversation is created lazily on first message — there is no separate "create empty thread" step.
- The sidebar badge is rendered server-side (RSC) and so updates on navigation; live in-page badge
  updates beyond that are a nice-to-have, not required.

## Functional requirements

### Conversations & threads

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Inbox (`/dashboard/messages`, `/instructor/messages`) | The page lists the viewer's conversations, most-recently-active first, each showing the other participant's name, the course title, a preview of the last message, the last-activity time, and an unread indicator/count. Empty state when the viewer has no conversations. |
| FR2 | Thread view | Selecting a conversation shows its messages oldest→newest with sender attribution and timestamps; the viewer's own messages are visually distinguished. |
| FR3 | Start conversation (student) | From an enrolled course, a "Message instructor" action opens (creating if absent) the `(student, instructor, course)` thread. Given the student is enrolled (active/completed) When they open the action Then a thread exists and is shown; the same action later reopens the **same** thread (no duplicates). |
| FR4 | Start conversation (instructor) | From `/instructor/students`, a "Message" action next to a student opens (creating if absent) that `(student, instructor, course)` thread. |
| FR5 | Uniqueness | At most one conversation exists per `(student, instructor, course)`; concurrent first-message attempts must not create duplicates. |

### Sending & reading

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR6 | Composer | A participant types and sends a non-empty message (trimmed, bounded length). It is persisted and appears in the thread for both participants. Empty/whitespace-only sends are rejected. |
| FR7 | Read state | Opening a thread marks all messages addressed to the viewer (sender ≠ viewer, unread) as read. A message is "unread" for a participant when its `readAt` is null and they are not the sender. |
| FR8 | Unread count | The viewer's total unread = count of messages across their conversations where `readAt` is null and sender ≠ viewer. |
| FR9 | Polling refresh | While a thread is open, new messages from the other participant appear within the poll interval without a manual refresh. The inbox unread state likewise refreshes on poll. |

### Authorization

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR10 | Send/read authz | Every conversation read, send, and mark-read verifies the caller is a participant (`studentId` or `instructorId` === caller). A non-participant receives a not-authorized error (no data leak / IDOR). |
| FR11 | Enrollment gate | Creating a conversation verifies a non-cancelled enrollment links the student to the course, and that `course.instructorId` is the instructor. If the enrollment is missing/cancelled, creation is refused. |

### Notifications & badge

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR12 | Sidebar badge | The Messages badge shows the viewer's real unread count (using `formatBadge`: hidden at 0, `9+` above nine), replacing the hardcoded `"2"`/`"3"`. |
| FR13 | Email on new message | When a message is sent, the recipient is emailed via `notificationService` (fire-and-forget). Send failure is logged and never blocks the message write. Dedup/throttling prevents an email storm from rapid back-to-back messages in the same thread. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | Participant check on every read/send/mark-read (FR10); enrollment gate on create (FR11). Message bodies are user content — escape on render, never `dangerouslySetInnerHTML`. |
| Performance | Inbox and thread queries avoid N+1 (join/select participant + course in one query); thread messages are paginated/bounded. Poll interval chosen to balance freshness vs. load (no tighter than necessary). |
| Reliability | Conversation creation is idempotent under concurrency (DB unique constraint on the triple). Email send is isolated from the message write. |
| Accessibility / UX | Keyboard-sendable composer; clear empty, loading, and send-error states; unread badge has an accessible label like the existing reviews badge. |
| Observability | Failed email sends and authorization failures are logged via the existing `logger`. |
| Data / privacy | Message bodies are private to the two participants; no third party (including admins, for v1) can read them through this feature. |

## Success metrics

- Sidebar Messages badge count matches the actual number of unread messages for the signed-in user
  (no more hardcoded value).
- A student and instructor can complete a full round-trip (student asks → instructor replies →
  student sees reply) without leaving the app or manually refreshing.
- Zero duplicate conversations for a given `(student, instructor, course)` under normal and
  concurrent use.

## Out of scope (deferred)

- Group / course-wide chat rooms.
- Attachments, images, rich text, emoji reactions, typing indicators, read receipts beyond unread.
- Messaging users with no enrollment relationship (e.g. pre-sales questions, student↔student, admin
  broadcast).
- WebSocket / SSE real-time transport (polling only for v1).
- Message search, archiving, deletion/blocking, and moderation/reporting tooling.
- In-page live badge updates beyond RSC-on-navigation refresh.

## Open questions

- Poll interval value and message-length cap — to be fixed in `spec.md` (proposed: ~10s poll for an
  open thread; ~2000-char body limit).
- Exact email dedup window for FR13 (e.g. one "new message" email per thread per N minutes) — decide
  in `spec.md`.