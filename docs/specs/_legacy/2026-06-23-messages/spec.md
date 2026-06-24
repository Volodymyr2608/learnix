# Spec: Direct Messages (Student ↔ Instructor)

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

A 1-on-1, per-course direct-message feature built on the existing **router → service → repository**
layering. Two new Prisma models — `Conversation` (keyed uniquely on `studentId + instructorId +
courseId`) and `Message` (with a nullable `readAt` for unread tracking) — back a new `message` tRPC
router exposed as `protectedProcedure` (both roles use the same endpoints; authorization is a
participant check, not a role check). Near-real-time delivery is client **polling** (`refetchInterval`)
rather than sockets, because Vercel serverless cannot hold persistent connections (decision #4). New
messages email the recipient by reusing `notificationService` + `emailService` + `NotificationLog`
dedup, exactly like `fireCertificateEarned` (decision #5). The sidebar unread badge is wired through
the same RSC path as the existing `reviewsCount` flow (decision #6). The key trade-off: per-course
threads (not per-person) — chosen because permission to message *is* the `(student, course)`
enrollment, so each thread maps onto exactly one enrollment we can authorize against; the rejected
alternative (per-person) makes authorization fuzzier and loses course context.

## Architectural decisions referenced

- **Three-layer pattern** (CLAUDE.md) — data access in repositories extending `BaseRepository`,
  business logic + typed errors in a service (`messaging.service.ts` + `.errors.ts`), transport in
  the `message` router composed into `server/api/root.ts`.
- **Procedure-level authz** (`server/api/trpc.ts`) — endpoints are `protectedProcedure` (auth
  required, role-agnostic); the participant/enrollment checks live in the service.
- **Notification dedup pattern** (certificates ADR / `notification.service.ts`) — `notificationLogRepository.tryLog({dedupKey, automation})` gates at-most-once email sends; `emailService.send({templateKey, toEmail, userId, payload})` renders a React-Email template. New message email follows this shape.
- **Dynamic sidebar badge** (spec `2026-06-19-instructor-new-reviews-badge`) — `Sidebar/index.tsx`
  fetches a count in RSC and passes it to `Navigation`; we mirror it for unread messages.
- **Component conventions** (CLAUDE.md) — colocated `types.ts`, no nested ternaries, flattened
  loading states, sub-components own their mutations.

## Data model

### `prisma/schema/message.prisma` (new)

```prisma
model Conversation {
  id String @id @default(cuid())

  studentId String
  student   User   @relation("StudentConversations", fields: [studentId], references: [id], onDelete: Cascade)

  instructorId String
  instructor   User @relation("InstructorConversations", fields: [instructorId], references: [id], onDelete: Cascade)

  courseId String
  course   Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  messages Message[]

  createdAt     DateTime @default(now())
  lastMessageAt DateTime @default(now()) // inbox sort key, bumped on every send

  @@unique([studentId, instructorId, courseId]) // FR5: one thread per triple
  @@index([studentId, lastMessageAt])
  @@index([instructorId, lastMessageAt])
  @@map("conversations")
}

model Message {
  id String @id @default(cuid())

  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  senderId String
  sender   User   @relation("SentMessages", fields: [senderId], references: [id], onDelete: Cascade)

  body String @db.Text

  readAt    DateTime? // null = unread by the recipient (FR7/FR8)
  createdAt DateTime  @default(now())

  @@index([conversationId, createdAt])
  // unread-count lookup: messages in my conversations not sent by me, readAt null
  @@index([conversationId, senderId, readAt])
  @@map("messages")
}
```

**`prisma/schema/auth.prisma` (modified)** — add the inverse relations on `User`:
`studentConversations Conversation[] @relation("StudentConversations")`,
`instructorConversations Conversation[] @relation("InstructorConversations")`,
`sentMessages Message[] @relation("SentMessages")`.

**`prisma/schema/course.prisma` (modified)** — add `conversations Conversation[]` inverse on `Course`.

Migration is purely additive (new tables + relation columns on existing tables are virtual, no SQL
column changes to `users`/`courses`) — `pnpm db:generate` then `pnpm db:migrate`. No backfill.

## API & contracts

New router `message` (`server/api/routers/message.ts`), composed into `root.ts` as `message`. All
`protectedProcedure`; the service enforces participant/enrollment rules (FR10/FR11). DTOs in
`server/entities/messaging/messaging.dto.ts` (Zod).

| Procedure | Type / auth | Input → Output | Notes |
|-----------|-------------|----------------|-------|
| `message.listConversations` | `protectedProcedure` | `void` → `ConversationSummary[]` | Viewer's threads, `lastMessageAt` desc; each has other-participant name, course title, last-message preview, `lastMessageAt`, `unreadCount`. Role decides which side the caller is on. |
| `message.getOrCreateConversation` | `protectedProcedure` | `{ courseId, studentId? }` → `{ conversationId }` | Idempotent (FR3/FR4/FR5). Student caller: `studentId` = self, derive `instructorId` from course. Instructor caller: must pass `studentId`, self = instructor. Enrollment gate (FR11). |
| `message.getThread` | `protectedProcedure` | `{ conversationId, cursor? }` → `{ messages, otherParticipant, course, nextCursor }` | Participant check (FR10). Paginated oldest→newest. **Does not** mutate read state (kept separate for predictable polling). |
| `message.markRead` | `protectedProcedure` | `{ conversationId }` → `{ updated: number }` | Sets `readAt=now()` on messages where `senderId != caller AND readAt IS NULL` (FR7). |
| `message.send` | `protectedProcedure` | `{ conversationId, body }` → `{ id, createdAt }` | Participant check; `body` trimmed, 1–2000 chars (FR6). Bumps `lastMessageAt`, fires email (FR13) fire-and-forget. |
| `message.getUnreadCount` | `protectedProcedure` | `void` → `number` | Total unread across viewer's conversations (FR8/FR12). Backs the sidebar badge. |

## Component / data flow

```
START CONVERSATION (student)                    SEND + DELIVER
 course page "Message instructor"                composer.submit(body)
   │ getOrCreateConversation({courseId})           │ message.send({conversationId, body})
   ▼                                                ▼
 service: enrollment gate (FR11) ──fail──► FORBIDDEN   service: participant check (FR10) ─fail─► FORBIDDEN
   │ upsert on @@unique triple (idempotent)         │ messageRepo.create + bump lastMessageAt (tx)
   ▼                                                 │ notificationService.fireNewMessage(...).catch(log)  ◄ fire-and-forget
 redirect → /dashboard/messages?c=<id>              ▼  └─ tryLog(dedupKey) → emailService.send("message.new")
                                                  return {id, createdAt}

OPEN THREAD (either side)                        POLLING (open thread)
 getThread({conversationId})  ─► render messages   useQuery(getThread, {refetchInterval ~10s})
 markRead({conversationId})   ─► clears unread     useQuery(getUnreadCount, {refetchInterval})
                                                   new messages from other side appear within interval (FR9)

SIDEBAR BADGE (RSC, like reviewsCount)
 Sidebar/index.tsx → getUnreadMessagesCount() → api.message.getUnreadCount() → Navigation badge (formatBadge, FR12)
```

## File list

**New**
- `prisma/schema/message.prisma` — `Conversation` + `Message` models, unique triple, indexes.
- `server/entities/messaging/messaging.dto.ts` — Zod inputs (`sendMessageInput`, `getThreadInput`, `getOrCreateInput`) + output DTO types (`ConversationSummary`, `ThreadMessage`).
- `server/repositories/conversation.repository.ts` — `ConversationRepository extends BaseRepository`; `findForUser` (inbox with last message + unread aggregate), `findByTriple`, `getOrCreate` (idempotent upsert), `bumpLastMessageAt`, `getTotalUnread`.
- `server/repositories/message.repository.ts` — `MessageRepository extends BaseRepository`; `listByConversation` (paginated), `markReadFor`, `create`.
- `server/services/messaging/messaging.service.ts` — orchestration + authz (participant/enrollment), trimming/validation, email trigger; `MessagingService` singleton.
- `server/services/messaging/messaging.errors.ts` — `MessagingError` typed errors (`FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`).
- `server/api/routers/message.ts` — the six procedures above.
- `app/_emails/MessageNewEmail.tsx` — React-Email template for "you have a new message".
- `lib/requests/messages/getUnreadMessagesCount.ts` — RSC helper mirroring `getNewReviewsCount.ts`.
- `app/dashboard/messages/page.tsx` / `app/instructor/messages/page.tsx` — RSC inbox pages (thin; render the shared client component).
- `app/_components/Messaging/` — `Inbox/` (conversation list), `Thread/` (message list + `MessageBubble`), `Composer/`, each with colocated `types.ts`; client components using `api` from `trpc/client` with `refetchInterval`.

**Modified**
- `server/api/root.ts` — register `message: messageRouter`.
- `prisma/schema/auth.prisma` — `User` inverse relations (student/instructor conversations, sent messages).
- `prisma/schema/course.prisma` — `Course.conversations` inverse relation.
- `server/services/notifications/notification.service.ts` — add `fireNewMessage(messageId)` following `fireCertificateEarned`.
- `server/services/email/email.templates.ts` — register `"message.new"` templateKey + subject.
- `app/_components/Dashboard/Sidebar/index.tsx` — fetch `unreadMessages` count (both roles) and pass to `Navigation`.
- `app/_components/Dashboard/Sidebar/components/Navigation/index.tsx` + `types.ts` — accept `unreadMessages`, drop hardcoded `"2"`/`"3"`, render via `formatBadge` like reviews.
- Entry points: enrolled-course UI (student "Message instructor") and `app/instructor/students` (per-student "Message") — add buttons calling `getOrCreateConversation` then navigating.

## Cross-cutting concerns

- **Security / authz (NFR, FR10/FR11):** every `getThread`/`send`/`markRead` loads the conversation and asserts `caller.id ∈ {studentId, instructorId}` before returning or mutating — prevents IDOR. `getOrCreateConversation` asserts a non-cancelled enrollment links `(studentId, courseId)` and that `course.instructorId` matches. Message bodies render as plain text (React auto-escapes; never `dangerouslySetInnerHTML`).
- **Error handling:** `MessagingService` throws `MessagingError` with a code; the router wraps calls in `handleServiceError` (existing util) to map to tRPC errors — same shape as `reviewRouter`.
- **Idempotency / consistency (FR5):** `getOrCreate` relies on the `@@unique([studentId, instructorId, courseId])` constraint; on a concurrent unique-violation it re-reads and returns the existing row. `send` writes the message and bumps `lastMessageAt` in one transaction (`BaseRepository.transaction`).
- **Observability:** email-send and authorization failures logged via existing `logger`.
- **Performance (NFR):** inbox uses a single query selecting conversation + course + last message + a grouped unread count (no N+1); `getUnreadCount` is one aggregate over the `(conversationId, senderId, readAt)` index; thread is cursor-paginated. Poll interval ~10s for an open thread; unread-count poll likewise — chosen to bound serverless invocations.

## Risks & mitigations

| Risk | L/I | Mitigation |
|------|-----|------------|
| Polling load on Vercel (function invocations) | M/M | Conservative ~10s interval; pause polling when tab hidden (React Query default `refetchIntervalInBackground:false`); cheap indexed queries. |
| Email storm from rapid messages | M/L | `tryLog` dedup keyed per `(recipient, conversation, time-bucket)` so at most one "new message" email per thread per window (FR13); resolve exact window in plan. |
| Duplicate conversations under race | L/M | DB unique constraint + catch-and-reread in `getOrCreate`. |
| Unread count drift if `markRead` races with new send | L/L | `markRead` only touches `readAt IS NULL AND senderId != caller`; counts recompute on next poll. |

## Rollout / migration

- No new env vars (reuses Resend/email + auth config already required).
- Migration additive: `pnpm db:generate` (new migration) → `pnpm db:migrate`; `pnpm generate` to refresh the Prisma client and `prisma/zod` types.
- No feature flag — the feature replaces dead links, so shipping it is the rollout. Undo = revert the migration + code.
- Manual ops: none.