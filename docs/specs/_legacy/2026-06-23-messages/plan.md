# Direct Messages (Student ↔ Instructor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 1-on-1, per-course direct messaging between an enrolled student and the course instructor, with polling delivery, email notification, and a real sidebar unread badge.

**Architecture:** Two new Prisma models (`Conversation`, `Message`) behind the existing router → service → repository layering. A new `message` tRPC router (all `protectedProcedure`; authz is a participant/enrollment check in the service). Client polling via React Query `refetchInterval`. New-message email reuses `notificationService` + `emailService` + `NotificationLog` dedup. Sidebar badge reuses the existing `reviewsCount` RSC flow.

**Tech Stack:** Next.js 16 App Router, tRPC, Prisma (postgres, `prismaSchemaFolder`), Better Auth, React Query, @react-email, Vitest (integration tests against `learnix_test`), Biome.

## Global Constraints

- **Layering:** data access only in repositories extending `BaseRepository`; business logic + typed `DomainError` subclasses in services; transport in routers using `handleServiceError`.
- **Procedure auth:** all message endpoints are `protectedProcedure`; role/participant rules live in the service.
- **Conversation key:** unique on `(studentId, instructorId, courseId)` — one thread per triple.
- **Unread definition:** a message is unread for a user when `readAt IS NULL AND senderId != user`.
- **Message body:** trimmed, 1–2000 chars. Render as plain text (React auto-escapes; never `dangerouslySetInnerHTML`).
- **Poll intervals:** open thread `10_000` ms; inbox + unread badge `15_000` ms. `refetchIntervalInBackground` stays default (false).
- **Email dedup window:** one "new message" email per `(recipient, conversation)` per 5-minute bucket; `automation: "new_message"`.
- **Page size:** thread loads 30 messages per page.
- **Component conventions:** colocated `types.ts`; no nested ternaries in JSX or logic (extract helpers/sub-components); flattened loading states; sub-components own their mutations.
- **Tests:** repository tests are `*.integration.test.ts` (real `learnix_test` DB) using `test/factories.ts`; service tests likewise. Run with `pnpm test:integration`.

---

### Task 1: Schema — `Conversation` + `Message` models & migration

**Files:**
- Create: `prisma/schema/message.prisma`
- Modify: `prisma/schema/auth.prisma` (User inverse relations)
- Modify: `prisma/schema/course.prisma` (Course inverse relation)

**Interfaces:**
- Produces: Prisma models `Conversation` (`@@unique([studentId, instructorId, courseId])`) and `Message` (nullable `readAt`), available on `db.conversation` / `db.message` and in `Prisma.*` types.

- [ ] **Step 1: Write `prisma/schema/message.prisma`**

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
  lastMessageAt DateTime @default(now())

  @@unique([studentId, instructorId, courseId])
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

  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([conversationId, createdAt])
  @@index([conversationId, senderId, readAt])
  @@map("messages")
}
```

- [ ] **Step 2: Add inverse relations to `User` in `prisma/schema/auth.prisma`**

In the `model User { ... }` block, alongside the existing relation fields (e.g. near `enrollments Enrollment[]`), add:

```prisma
  studentConversations    Conversation[] @relation("StudentConversations")
  instructorConversations Conversation[] @relation("InstructorConversations")
  sentMessages            Message[]      @relation("SentMessages")
```

- [ ] **Step 3: Add inverse relation to `Course` in `prisma/schema/course.prisma`**

In the `model Course { ... }` block, alongside its existing relation fields, add:

```prisma
  conversations Conversation[]
```

- [ ] **Step 4: Generate the migration and Prisma client**

Run: `pnpm db:generate`
When prompted for a migration name, enter: `add_messaging`
Expected: a new folder under `prisma/migrations/*_add_messaging/` with `CREATE TABLE "conversations"` and `CREATE TABLE "messages"`; Prisma client regenerated to `generated/prisma`.

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (no errors; `Prisma.ConversationUncheckedCreateInput`, `db.message`, etc. now exist).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema/message.prisma prisma/schema/auth.prisma prisma/schema/course.prisma prisma/migrations
git commit -m "feat(messages): add Conversation and Message schema"
```

---

### Task 2: `ConversationRepository`

**Files:**
- Create: `server/repositories/conversation.repository.ts`
- Test: `server/repositories/conversation.repository.integration.test.ts`

**Interfaces:**
- Consumes: `BaseRepository`, `db`, `Prisma`, `Conversation` from Task 1.
- Produces:
  - `conversationRepository.findByTriple(studentId: string, instructorId: string, courseId: string): Promise<Conversation | null>`
  - `conversationRepository.getOrCreate(studentId: string, instructorId: string, courseId: string): Promise<Conversation>`
  - `conversationRepository.findWithParticipants(id: string): Promise<ConversationWithParticipants | null>`
  - `conversationRepository.findForUser(userId: string): Promise<ConversationInboxRow[]>`
  - exported types `ConversationWithParticipants`, `ConversationInboxRow`.

- [ ] **Step 1: Write the failing test**

```ts
// server/repositories/conversation.repository.integration.test.ts
import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";
import { conversationRepository } from "./conversation.repository";

describe("ConversationRepository.getOrCreate", () => {
  it("creates once and returns the same row on repeat calls", async () => {
    const instructor = await makeUser({ role: Role.INSTRUCTOR });
    const student = await makeUser({ role: Role.STUDENT });
    const course = await makeCourse({
      instructorId: instructor.id,
      status: CourseStatus.published,
    });

    const first = await conversationRepository.getOrCreate(
      student.id,
      instructor.id,
      course.id,
    );
    const second = await conversationRepository.getOrCreate(
      student.id,
      instructor.id,
      course.id,
    );

    expect(second.id).toBe(first.id);
    const count = await testDb.conversation.count({
      where: { studentId: student.id, courseId: course.id },
    });
    expect(count).toBe(1);
  });
});

describe("ConversationRepository.findForUser", () => {
  it("returns threads newest-first with other participant, preview and unread count", async () => {
    const instructor = await makeUser({ role: Role.INSTRUCTOR, name: "Dr Who" });
    const student = await makeUser({ role: Role.STUDENT, name: "Ada" });
    const course = await makeCourse({
      instructorId: instructor.id,
      title: "React Basics",
      status: CourseStatus.published,
    });
    const convo = await conversationRepository.getOrCreate(
      student.id,
      instructor.id,
      course.id,
    );
    // instructor sends one unread message to the student
    await testDb.message.create({
      data: { conversationId: convo.id, senderId: instructor.id, body: "Welcome!" },
    });

    const rows = await conversationRepository.findForUser(student.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: convo.id,
      courseTitle: "React Basics",
      otherParticipantName: "Dr Who",
      lastMessagePreview: "Welcome!",
      unreadCount: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration conversation.repository`
Expected: FAIL — `Cannot find module './conversation.repository'`.

- [ ] **Step 3: Write the repository**

```ts
// server/repositories/conversation.repository.ts
import type { Conversation, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export type ConversationWithParticipants = {
  id: string;
  studentId: string;
  instructorId: string;
  courseId: string;
  studentName: string;
  instructorName: string;
  courseTitle: string;
};

export type ConversationInboxRow = {
  id: string;
  courseId: string;
  courseTitle: string;
  otherParticipantName: string;
  lastMessagePreview: string;
  lastMessageAt: Date;
  unreadCount: number;
};

export default class ConversationRepository extends BaseRepository<
  "conversation",
  Conversation,
  Prisma.ConversationUncheckedCreateInput,
  Prisma.ConversationUpdateInput,
  Prisma.ConversationWhereInput,
  Prisma.ConversationInclude,
  Prisma.ConversationSelect,
  Prisma.ConversationOrderByWithRelationInput
> {
  protected readonly modelName = "conversation";

  findByTriple(studentId: string, instructorId: string, courseId: string) {
    return this.findFirst({ where: { studentId, instructorId, courseId } });
  }

  async getOrCreate(
    studentId: string,
    instructorId: string,
    courseId: string,
  ): Promise<Conversation> {
    const existing = await this.findByTriple(studentId, instructorId, courseId);
    if (existing) return existing;
    try {
      return await this.createRaw({ studentId, instructorId, courseId });
    } catch (error) {
      // Lost a race against a concurrent first message: re-read the row the
      // @@unique([studentId, instructorId, courseId]) constraint protected.
      const row = await this.findByTriple(studentId, instructorId, courseId);
      if (row) return row;
      throw error;
    }
  }

  async findWithParticipants(
    id: string,
  ): Promise<ConversationWithParticipants | null> {
    const row = await this.model.findUnique({
      where: { id },
      select: {
        id: true,
        studentId: true,
        instructorId: true,
        courseId: true,
        student: { select: { name: true } },
        instructor: { select: { name: true } },
        course: { select: { title: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      studentId: row.studentId,
      instructorId: row.instructorId,
      courseId: row.courseId,
      studentName: row.student.name,
      instructorName: row.instructor.name,
      courseTitle: row.course.title,
    };
  }

  async findForUser(userId: string): Promise<ConversationInboxRow[]> {
    const rows = await this.model.findMany({
      where: { OR: [{ studentId: userId }, { instructorId: userId }] },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        studentId: true,
        courseId: true,
        lastMessageAt: true,
        student: { select: { name: true } },
        instructor: { select: { name: true } },
        course: { select: { title: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true },
        },
        _count: {
          select: {
            messages: { where: { readAt: null, NOT: { senderId: userId } } },
          },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      courseTitle: r.course.title,
      otherParticipantName:
        r.studentId === userId ? r.instructor.name : r.student.name,
      lastMessagePreview: r.messages[0]?.body ?? "",
      lastMessageAt: r.lastMessageAt,
      unreadCount: r._count.messages,
    }));
  }
}

export const conversationRepository = new ConversationRepository();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration conversation.repository`
Expected: PASS (both describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add server/repositories/conversation.repository.ts server/repositories/conversation.repository.integration.test.ts
git commit -m "feat(messages): add ConversationRepository"
```

---

### Task 3: `MessageRepository`

**Files:**
- Create: `server/repositories/message.repository.ts`
- Test: `server/repositories/message.repository.integration.test.ts`

**Interfaces:**
- Consumes: `BaseRepository`, `db`, `Prisma`, `Message` from Task 1; conversations from Task 2 (tests only).
- Produces:
  - `messageRepository.createWithBump(conversationId: string, senderId: string, body: string): Promise<Message>`
  - `messageRepository.listByConversation(conversationId: string, limit: number, cursor?: string): Promise<Message[]>` — returns up to `limit + 1` rows, newest-first.
  - `messageRepository.markReadFor(conversationId: string, viewerId: string): Promise<number>`
  - `messageRepository.getTotalUnreadForUser(userId: string): Promise<number>`
  - `messageRepository.findForNotification(messageId: string): Promise<MessageNotificationData | null>`
  - exported type `MessageNotificationData`.

- [ ] **Step 1: Write the failing test**

```ts
// server/repositories/message.repository.integration.test.ts
import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { conversationRepository } from "./conversation.repository";
import { makeCourse, makeUser } from "@/test/factories";
import { messageRepository } from "./message.repository";

async function seedConversation() {
  const instructor = await makeUser({ role: Role.INSTRUCTOR });
  const student = await makeUser({ role: Role.STUDENT });
  const course = await makeCourse({
    instructorId: instructor.id,
    status: CourseStatus.published,
  });
  const convo = await conversationRepository.getOrCreate(
    student.id,
    instructor.id,
    course.id,
  );
  return { instructor, student, course, convo };
}

describe("MessageRepository.createWithBump", () => {
  it("creates a message and advances the conversation lastMessageAt", async () => {
    const { convo, student } = await seedConversation();
    const before = await conversationRepository.findByTriple(
      convo.studentId,
      convo.instructorId,
      convo.courseId,
    );

    const message = await messageRepository.createWithBump(
      convo.id,
      student.id,
      "Hi there",
    );

    const after = await conversationRepository.findByTriple(
      convo.studentId,
      convo.instructorId,
      convo.courseId,
    );
    expect(message.body).toBe("Hi there");
    expect(after?.lastMessageAt.getTime()).toBeGreaterThanOrEqual(
      before?.lastMessageAt.getTime() ?? 0,
    );
  });
});

describe("MessageRepository.markReadFor + getTotalUnreadForUser", () => {
  it("marks only the recipient's unread messages and counts unread", async () => {
    const { convo, instructor, student } = await seedConversation();
    await messageRepository.createWithBump(convo.id, instructor.id, "one");
    await messageRepository.createWithBump(convo.id, instructor.id, "two");
    await messageRepository.createWithBump(convo.id, student.id, "reply");

    expect(await messageRepository.getTotalUnreadForUser(student.id)).toBe(2);
    expect(await messageRepository.getTotalUnreadForUser(instructor.id)).toBe(1);

    const updated = await messageRepository.markReadFor(convo.id, student.id);
    expect(updated).toBe(2);
    expect(await messageRepository.getTotalUnreadForUser(student.id)).toBe(0);
    // the student's own message is still unread for the instructor
    expect(await messageRepository.getTotalUnreadForUser(instructor.id)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration message.repository`
Expected: FAIL — `Cannot find module './message.repository'`.

- [ ] **Step 3: Write the repository**

```ts
// server/repositories/message.repository.ts
import type { Message, Prisma } from "@/generated/prisma";
import { db } from "@/server/db";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export type MessageNotificationData = {
  body: string;
  senderId: string;
  conversation: {
    id: string;
    studentId: string;
    instructorId: string;
    student: { name: string; email: string };
    instructor: { name: string; email: string };
    course: { title: string };
  };
};

export default class MessageRepository extends BaseRepository<
  "message",
  Message,
  Prisma.MessageUncheckedCreateInput,
  Prisma.MessageUpdateInput,
  Prisma.MessageWhereInput,
  Prisma.MessageInclude,
  Prisma.MessageSelect,
  Prisma.MessageOrderByWithRelationInput
> {
  protected readonly modelName = "message";

  createWithBump(
    conversationId: string,
    senderId: string,
    body: string,
  ): Promise<Message> {
    return db.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { conversationId, senderId, body },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: message.createdAt },
      });
      return message;
    });
  }

  listByConversation(
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<Message[]> {
    return this.model.findMany({
      where: {
        conversationId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });
  }

  async markReadFor(conversationId: string, viewerId: string): Promise<number> {
    const result = await this.model.updateMany({
      where: { conversationId, readAt: null, NOT: { senderId: viewerId } },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  getTotalUnreadForUser(userId: string): Promise<number> {
    return this.model.count({
      where: {
        readAt: null,
        NOT: { senderId: userId },
        conversation: {
          OR: [{ studentId: userId }, { instructorId: userId }],
        },
      },
    });
  }

  findForNotification(
    messageId: string,
  ): Promise<MessageNotificationData | null> {
    return this.model.findUnique({
      where: { id: messageId },
      select: {
        body: true,
        senderId: true,
        conversation: {
          select: {
            id: true,
            studentId: true,
            instructorId: true,
            student: { select: { name: true, email: true } },
            instructor: { select: { name: true, email: true } },
            course: { select: { title: true } },
          },
        },
      },
    });
  }
}

export const messageRepository = new MessageRepository();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration message.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/message.repository.ts server/repositories/message.repository.integration.test.ts
git commit -m "feat(messages): add MessageRepository"
```

---

### Task 4: DTOs & typed error

**Files:**
- Create: `server/entities/messaging/messaging.dto.ts`
- Create: `server/services/messaging/messaging.errors.ts`

**Interfaces:**
- Produces:
  - Zod inputs `sendMessageInput`, `getThreadInput`, `getOrCreateConversationInput` and their inferred types `SendMessageInput`, `GetThreadInput`, `GetOrCreateConversationInput`.
  - Output DTO types `ConversationSummary`, `ThreadMessage`, `ThreadView`.
  - `MessagingError extends DomainError`.

- [ ] **Step 1: Write the DTO module**

```ts
// server/entities/messaging/messaging.dto.ts
import { z } from "zod";

export const sendMessageInput = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});
export type SendMessageInput = z.infer<typeof sendMessageInput>;

export const getThreadInput = z.object({
  conversationId: z.string().min(1),
  cursor: z.string().optional(),
});
export type GetThreadInput = z.infer<typeof getThreadInput>;

export const getOrCreateConversationInput = z.object({
  courseId: z.string().min(1),
  studentId: z.string().min(1).optional(),
});
export type GetOrCreateConversationInput = z.infer<
  typeof getOrCreateConversationInput
>;

export type ConversationSummary = {
  id: string;
  courseId: string;
  courseTitle: string;
  otherParticipantName: string;
  lastMessagePreview: string;
  lastMessageAt: string; // ISO
  unreadCount: number;
};

export type ThreadMessage = {
  id: string;
  body: string;
  senderId: string;
  isMine: boolean;
  createdAt: string; // ISO
};

export type ThreadView = {
  conversationId: string;
  otherParticipantName: string;
  courseTitle: string;
  messages: ThreadMessage[]; // oldest → newest
  nextCursor: string | null;
};
```

- [ ] **Step 2: Write the error class**

```ts
// server/services/messaging/messaging.errors.ts
import { DomainError } from "@/server/services/base/base.errors";

export class MessagingError extends DomainError {}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/entities/messaging server/services/messaging/messaging.errors.ts
git commit -m "feat(messages): add messaging DTOs and error type"
```

---

### Task 5: `MessagingService`

**Files:**
- Create: `server/services/messaging/messaging.service.ts`
- Test: `server/services/messaging/messaging.service.integration.test.ts`

**Interfaces:**
- Consumes: `conversationRepository` (Task 2), `messageRepository` (Task 3), `enrollmentRepository.findByStudentCourse`, `courseRepository.findFirst`, DTO types + `MessagingError` (Task 4), `notificationService.fireNewMessage` (Task 6 — call is fire-and-forget; stub-tolerant), `Role` from `@/generated/prisma`, `logger`.
- Produces `messagingService` with:
  - `getOrCreateConversation(caller: { id: string; role: Role }, input: GetOrCreateConversationInput): Promise<{ conversationId: string }>`
  - `listConversations(userId: string): Promise<ConversationSummary[]>`
  - `getThread(userId: string, input: GetThreadInput): Promise<ThreadView>`
  - `markRead(userId: string, conversationId: string): Promise<{ updated: number }>`
  - `send(userId: string, input: SendMessageInput): Promise<{ id: string; createdAt: string }>`
  - `getUnreadCount(userId: string): Promise<number>`

> Note: this task imports `notificationService` from Task 6. Implement Task 6 first OR temporarily comment the `notificationService.fireNewMessage(...)` line until Task 6 lands. Recommended order: Task 6 then Task 5. The interfaces are written assuming Task 6 exists.

- [ ] **Step 1: Write the failing test**

```ts
// server/services/messaging/messaging.service.integration.test.ts
import { describe, expect, it } from "vitest";
import { CourseStatus, EnrollmentStatus, Role } from "@/generated/prisma";
import { makeCourse, makeEnrollment, makeUser } from "@/test/factories";
import { messagingService } from "./messaging.service";

async function seed(enroll = true) {
  const instructor = await makeUser({ role: Role.INSTRUCTOR, name: "Inst" });
  const student = await makeUser({ role: Role.STUDENT, name: "Stud" });
  const course = await makeCourse({
    instructorId: instructor.id,
    status: CourseStatus.published,
  });
  if (enroll) {
    await makeEnrollment({
      studentId: student.id,
      courseId: course.id,
      status: EnrollmentStatus.active,
    });
  }
  return { instructor, student, course };
}

describe("MessagingService.getOrCreateConversation", () => {
  it("creates a thread for an enrolled student", async () => {
    const { student, course } = await seed();
    const { conversationId } = await messagingService.getOrCreateConversation(
      { id: student.id, role: Role.STUDENT },
      { courseId: course.id },
    );
    expect(conversationId).toBeTruthy();
  });

  it("refuses when the student is not enrolled", async () => {
    const { student, course } = await seed(false);
    await expect(
      messagingService.getOrCreateConversation(
        { id: student.id, role: Role.STUDENT },
        { courseId: course.id },
      ),
    ).rejects.toThrow(/enrolled|forbidden/i);
  });
});

describe("MessagingService.send + getThread + getUnreadCount", () => {
  it("round-trips a message and tracks unread + read", async () => {
    const { instructor, student, course } = await seed();
    const { conversationId } = await messagingService.getOrCreateConversation(
      { id: student.id, role: Role.STUDENT },
      { courseId: course.id },
    );

    await messagingService.send(student.id, {
      conversationId,
      body: "Question about lesson 3",
    });

    // instructor sees it as unread, and in the thread as not theirs
    expect(await messagingService.getUnreadCount(instructor.id)).toBe(1);
    const thread = await messagingService.getThread(instructor.id, {
      conversationId,
    });
    expect(thread.messages.at(-1)).toMatchObject({
      body: "Question about lesson 3",
      isMine: false,
    });

    // after markRead, unread clears
    await messagingService.markRead(instructor.id, conversationId);
    expect(await messagingService.getUnreadCount(instructor.id)).toBe(0);
  });

  it("blocks a non-participant from reading a thread (IDOR)", async () => {
    const { student, course } = await seed();
    const { conversationId } = await messagingService.getOrCreateConversation(
      { id: student.id, role: Role.STUDENT },
      { courseId: course.id },
    );
    const outsider = await makeUser({ role: Role.STUDENT });
    await expect(
      messagingService.getThread(outsider.id, { conversationId }),
    ).rejects.toThrow(/forbidden|not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration messaging.service`
Expected: FAIL — `Cannot find module './messaging.service'`.

- [ ] **Step 3: Write the service**

```ts
// server/services/messaging/messaging.service.ts
import { Role } from "@/generated/prisma";
import type {
  ConversationSummary,
  GetOrCreateConversationInput,
  GetThreadInput,
  SendMessageInput,
  ThreadView,
} from "@/server/entities/messaging/messaging.dto";
import { courseRepository } from "@/server/repositories/course.repository";
import { conversationRepository } from "@/server/repositories/conversation.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { messageRepository } from "@/server/repositories/message.repository";
import { MessagingError } from "@/server/services/messaging/messaging.errors";
import { notificationService } from "@/server/services/notifications/notification.service";
import { logger } from "@/server/utils/logger";

const PAGE_SIZE = 30;

class MessagingService {
  async getOrCreateConversation(
    caller: { id: string; role: Role },
    input: GetOrCreateConversationInput,
  ): Promise<{ conversationId: string }> {
    const course = await courseRepository.findFirst({
      where: { id: input.courseId, deletedAt: null },
      select: { id: true, instructorId: true },
    });
    if (!course) {
      throw new MessagingError("Course not found", "NOT_FOUND");
    }

    let studentId: string;
    const instructorId = course.instructorId;
    if (caller.role === Role.STUDENT) {
      studentId = caller.id;
    } else if (caller.role === Role.INSTRUCTOR) {
      if (course.instructorId !== caller.id) {
        throw new MessagingError("Not your course", "FORBIDDEN");
      }
      if (!input.studentId) {
        throw new MessagingError("studentId is required", "BAD_REQUEST");
      }
      studentId = input.studentId;
    } else {
      throw new MessagingError("Not allowed", "FORBIDDEN");
    }

    const enrollment = await enrollmentRepository.findByStudentCourse(
      studentId,
      input.courseId,
    );
    if (!enrollment) {
      throw new MessagingError(
        "Messaging requires an active enrollment",
        "FORBIDDEN",
      );
    }

    const conversation = await conversationRepository.getOrCreate(
      studentId,
      instructorId,
      input.courseId,
    );
    return { conversationId: conversation.id };
  }

  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const rows = await conversationRepository.findForUser(userId);
    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      courseTitle: r.courseTitle,
      otherParticipantName: r.otherParticipantName,
      lastMessagePreview: r.lastMessagePreview,
      lastMessageAt: r.lastMessageAt.toISOString(),
      unreadCount: r.unreadCount,
    }));
  }

  async getThread(userId: string, input: GetThreadInput): Promise<ThreadView> {
    const convo = await this.assertParticipant(input.conversationId, userId);
    const rows = await messageRepository.listByConversation(
      convo.id,
      PAGE_SIZE,
      input.cursor,
    );
    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore
      ? (page.at(-1)?.createdAt.toISOString() ?? null)
      : null;
    const ascending = [...page].reverse();

    return {
      conversationId: convo.id,
      otherParticipantName:
        userId === convo.studentId ? convo.instructorName : convo.studentName,
      courseTitle: convo.courseTitle,
      messages: ascending.map((m) => ({
        id: m.id,
        body: m.body,
        senderId: m.senderId,
        isMine: m.senderId === userId,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }

  async markRead(
    userId: string,
    conversationId: string,
  ): Promise<{ updated: number }> {
    await this.assertParticipant(conversationId, userId);
    const updated = await messageRepository.markReadFor(conversationId, userId);
    return { updated };
  }

  async send(
    userId: string,
    input: SendMessageInput,
  ): Promise<{ id: string; createdAt: string }> {
    await this.assertParticipant(input.conversationId, userId);
    const message = await messageRepository.createWithBump(
      input.conversationId,
      userId,
      input.body,
    );
    notificationService
      .fireNewMessage(message.id)
      .catch((error) =>
        logger.warn("Failed to send new-message email", { error }),
      );
    return { id: message.id, createdAt: message.createdAt.toISOString() };
  }

  getUnreadCount(userId: string): Promise<number> {
    return messageRepository.getTotalUnreadForUser(userId);
  }

  private async assertParticipant(conversationId: string, userId: string) {
    const convo =
      await conversationRepository.findWithParticipants(conversationId);
    if (!convo) {
      throw new MessagingError("Conversation not found", "NOT_FOUND");
    }
    if (convo.studentId !== userId && convo.instructorId !== userId) {
      throw new MessagingError("Not a participant", "FORBIDDEN");
    }
    return convo;
  }
}

export const messagingService = new MessagingService();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration messaging.service`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add server/services/messaging/messaging.service.ts server/services/messaging/messaging.service.integration.test.ts
git commit -m "feat(messages): add MessagingService with authz + enrollment gate"
```

---

### Task 6: New-message email (template + `fireNewMessage`)

**Files:**
- Create: `app/_emails/MessageNewEmail.tsx`
- Modify: `server/services/email/email.templates.ts`
- Modify: `server/services/notifications/notification.service.ts`

**Interfaces:**
- Consumes: `messageRepository.findForNotification` (Task 3), `notificationLogRepository.tryLog`, `emailService.send`, `signUnsubscribeToken`, `env`.
- Produces: `notificationService.fireNewMessage(messageId: string): Promise<void>`; email templateKey `"message.new"`.

- [ ] **Step 1: Write the email component**

```tsx
// app/_emails/MessageNewEmail.tsx
import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
  recipientName: string;
  senderName: string;
  courseTitle: string;
  messagePreview: string;
  threadUrl: string;
  unsubscribeUrl: string;
};

export function MessageNewEmail({
  recipientName,
  senderName,
  courseTitle,
  messagePreview,
  threadUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <EmailLayout unsubscribeUrl={unsubscribeUrl}>
      <Heading style={{ fontSize: 24, color: "#111827" }}>
        New message from {senderName}
      </Heading>
      <Text style={{ color: "#374151", fontSize: 15 }}>
        Hi {recipientName}, you have a new message about {courseTitle}:
      </Text>
      <Text
        style={{
          color: "#111827",
          fontSize: 15,
          fontStyle: "italic",
          borderLeft: "3px solid #e5e7eb",
          paddingLeft: 12,
        }}
      >
        {messagePreview}
      </Text>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <EmailButton href={threadUrl}>Reply</EmailButton>
      </Section>
    </EmailLayout>
  );
}

MessageNewEmail.PreviewProps = {
  recipientName: "Ada",
  senderName: "Dr Who",
  courseTitle: "React Basics",
  messagePreview: "Great question — take a look at the hooks section…",
  threadUrl: "https://learnix.app/dashboard/messages?c=demo",
  unsubscribeUrl: "https://learnix.app/unsubscribe?token=demo",
} satisfies Props;

export default MessageNewEmail;
```

- [ ] **Step 2: Register the template**

In `server/services/email/email.templates.ts`, add the import near the other email imports:

```ts
import { MessageNewEmail } from "@/app/_emails/MessageNewEmail";
```

and add this entry inside the `emailTemplates` object (e.g. after `"enrollment.confirmed"`):

```ts
  "message.new": {
    component: MessageNewEmail,
    payload: z.object({
      recipientName: z.string(),
      senderName: z.string(),
      courseTitle: z.string(),
      messagePreview: z.string(),
      threadUrl: z.url(),
      unsubscribeUrl: z.url(),
    }),
    subject: (p) => `New message from ${p.senderName}`,
    criticality: "STANDARD",
  },
```

- [ ] **Step 3: Add `fireNewMessage` to the notification service**

In `server/services/notifications/notification.service.ts`, add the import at the top:

```ts
import { messageRepository } from "@/server/repositories/message.repository";
```

and add this method to the `NotificationService` class:

```ts
  async fireNewMessage(messageId: string): Promise<void> {
    const msg = await messageRepository.findForNotification(messageId);
    if (!msg) return;

    const { conversation } = msg;
    const senderIsStudent = msg.senderId === conversation.studentId;
    const sender = senderIsStudent
      ? conversation.student
      : conversation.instructor;
    const recipientId = senderIsStudent
      ? conversation.instructorId
      : conversation.studentId;
    const recipient = senderIsStudent
      ? conversation.instructor
      : conversation.student;
    const threadPath = senderIsStudent
      ? "/instructor/messages"
      : "/dashboard/messages";

    // One email per recipient/conversation per 5-minute bucket.
    const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const logged = await notificationLogRepository.tryLog({
      dedupKey: `${recipientId}:new_message:${conversation.id}:${bucket}`,
      userId: recipientId,
      automation: "new_message",
    });
    if (!logged.created) return;

    const unsubToken = await signUnsubscribeToken(recipientId);

    await emailService.send({
      templateKey: "message.new",
      toEmail: recipient.email,
      userId: recipientId,
      payload: {
        recipientName: recipient.name,
        senderName: sender.name,
        courseTitle: conversation.course.title,
        messagePreview: msg.body.slice(0, 140),
        threadUrl: `${env.BASE_URL}${threadPath}?c=${conversation.id}`,
        unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${unsubToken}`,
      },
    });
  }
```

- [ ] **Step 4: Verify typecheck + preview render**

Run: `pnpm typecheck`
Expected: PASS (template payload type matches the component `Props`).

- [ ] **Step 5: Commit**

```bash
git add app/_emails/MessageNewEmail.tsx server/services/email/email.templates.ts server/services/notifications/notification.service.ts
git commit -m "feat(messages): email recipient on new message"
```

---

### Task 7: `message` tRPC router

**Files:**
- Create: `server/api/routers/message.ts`
- Modify: `server/api/root.ts`

**Interfaces:**
- Consumes: `messagingService` (Task 5), DTO inputs (Task 4), `handleServiceError`, `protectedProcedure`.
- Produces: `message` router on `appRouter` with `listConversations`, `getUnreadCount`, `getOrCreateConversation`, `getThread`, `markRead`, `send`. Client gains `api.message.*`.

- [ ] **Step 1: Write the router**

```ts
// server/api/routers/message.ts
import { z } from "zod";
import {
  getOrCreateConversationInput,
  getThreadInput,
  sendMessageInput,
} from "@/server/entities/messaging/messaging.dto";
import { messagingService } from "@/server/services/messaging/messaging.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const messageRouter = createTRPCRouter({
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await messagingService.listConversations(ctx.session.user.id);
    } catch (error) {
      handleServiceError(error);
    }
  }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await messagingService.getUnreadCount(ctx.session.user.id);
    } catch (error) {
      handleServiceError(error);
    }
  }),

  getOrCreateConversation: protectedProcedure
    .input(getOrCreateConversationInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await messagingService.getOrCreateConversation(
          { id: ctx.session.user.id, role: ctx.session.user.role },
          input,
        );
      } catch (error) {
        handleServiceError(error);
      }
    }),

  getThread: protectedProcedure
    .input(getThreadInput)
    .query(async ({ ctx, input }) => {
      try {
        return await messagingService.getThread(ctx.session.user.id, input);
      } catch (error) {
        handleServiceError(error);
      }
    }),

  markRead: protectedProcedure
    .input(z.object({ conversationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await messagingService.markRead(
          ctx.session.user.id,
          input.conversationId,
        );
      } catch (error) {
        handleServiceError(error);
      }
    }),

  send: protectedProcedure
    .input(sendMessageInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await messagingService.send(ctx.session.user.id, input);
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
```

- [ ] **Step 2: Register it in `server/api/root.ts`**

Add the import:

```ts
import { messageRouter } from "@/server/api/routers/message";
```

and add the entry inside `createTRPCRouter({ ... })`:

```ts
	message: messageRouter,
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS — `api.message` now exists in the generated client types.

> If `ctx.session.user.role` reports a type error, confirm the session user type includes `role` (it is used by `roleProcedure` in `server/api/trpc.ts`). No code change should be needed.

- [ ] **Step 4: Commit**

```bash
git add server/api/routers/message.ts server/api/root.ts
git commit -m "feat(messages): add message tRPC router"
```

---

### Task 8: Sidebar unread badge (replace hardcoded counts)

**Files:**
- Create: `lib/requests/messages/getUnreadMessagesCount.ts`
- Modify: `app/_components/Dashboard/Sidebar/index.tsx`
- Modify: `app/_components/Dashboard/Sidebar/components/Navigation/index.tsx`
- Modify: `app/_components/Dashboard/Sidebar/components/Navigation/types.ts`

**Interfaces:**
- Consumes: `api.message.getUnreadCount` (Task 7), existing `formatBadge`.
- Produces: `getUnreadMessagesCount(): Promise<number>`; `NavigationProps` gains `unreadMessages: number`.

- [ ] **Step 1: Write the RSC count helper**

```ts
// lib/requests/messages/getUnreadMessagesCount.ts
import { api } from "@/trpc/server";

const getUnreadMessagesCount = async (): Promise<number> => {
  try {
    return (await api.message.getUnreadCount()) ?? 0;
  } catch (error) {
    console.error("Error fetching unread messages count:", error);
    return 0;
  }
};

export default getUnreadMessagesCount;
```

- [ ] **Step 2: Fetch the count in the Sidebar and pass it down**

In `app/_components/Dashboard/Sidebar/index.tsx`, add the import:

```ts
import getUnreadMessagesCount from "@/lib/requests/messages/getUnreadMessagesCount";
```

Change the data-fetch line:

```ts
	const reviewsCount = isInstructor ? await getNewReviewsCount() : 0;
```

to fetch both (both roles have messages):

```ts
	const [reviewsCount, unreadMessages] = await Promise.all([
		isInstructor ? getNewReviewsCount() : Promise.resolve(0),
		getUnreadMessagesCount(),
	]);
```

And pass the prop:

```tsx
				<Navigation
					isInstructor={isInstructor}
					reviewsCount={reviewsCount}
					unreadMessages={unreadMessages}
				/>
```

- [ ] **Step 3: Extend `NavigationProps`**

In `app/_components/Dashboard/Sidebar/components/Navigation/types.ts`, add `unreadMessages: number;`:

```ts
export interface NavigationProps {
  isInstructor: boolean;
  reviewsCount: number;
  unreadMessages: number;
}
```

- [ ] **Step 4: Use the real count and remove hardcoded badges**

In `app/_components/Dashboard/Sidebar/components/Navigation/index.tsx`:

1. Remove the two hardcoded `badge: "2"` / `badge: "3"` lines from the `Messages` entries in `instructorItems` and `studentItems`.

2. Add a badge resolver above the component (no nested ternaries — per CLAUDE.md):

```ts
function resolveBadge(
  item: NavItem,
  reviewsCount: number,
  unreadMessages: number,
): string | undefined {
  if (item.href === INSTRUCTOR_URLS.reviews) return formatBadge(reviewsCount);
  if (item.title === "Messages") return formatBadge(unreadMessages);
  return item.badge;
}

function badgeAriaLabel(item: NavItem, badge: string): string {
  if (item.href === INSTRUCTOR_URLS.reviews) return `${badge} new reviews`;
  if (item.title === "Messages") return `${badge} unread messages`;
  return `${badge} ${item.title}`;
}
```

3. Update the component signature and the per-item badge logic:

```tsx
const SidebarNavigation = ({
  isInstructor,
  reviewsCount,
  unreadMessages,
}: NavigationProps) => {
  const pathname = usePathname();
  const navItems = isInstructor ? instructorItems : studentItems;

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        const badge = resolveBadge(item, reviewsCount, unreadMessages);
        return (
          <Link
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-sm transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
            href={item.href}
            key={item.href}
          >
            <Icon className="h-5 w-5" />
            <span className="flex-1">{item.title}</span>
            {badge && (
              <span
                aria-label={badgeAriaLabel(item, badge)}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs"
                role="img"
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
};
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS — no hardcoded badge values remain; badge derives from real counts.

- [ ] **Step 6: Commit**

```bash
git add lib/requests/messages app/_components/Dashboard/Sidebar
git commit -m "feat(messages): wire real unread badge into sidebar"
```

---

### Task 9: Messaging UI (inbox + thread + composer)

**Files:**
- Create: `app/_components/Messaging/MessagesView/index.tsx` (client)
- Create: `app/_components/Messaging/MessagesView/types.ts`
- Create: `app/_components/Messaging/MessagesView/components/Inbox/index.tsx`
- Create: `app/_components/Messaging/MessagesView/components/Inbox/types.ts`
- Create: `app/_components/Messaging/MessagesView/components/Thread/index.tsx`
- Create: `app/_components/Messaging/MessagesView/components/Thread/types.ts`
- Create: `app/dashboard/messages/page.tsx`
- Create: `app/instructor/messages/page.tsx`

**Interfaces:**
- Consumes: `api` from `@/trpc/client` (`message.listConversations`, `message.getThread`, `message.send`, `message.markRead`).
- Produces: route pages at `/dashboard/messages` and `/instructor/messages`; `MessagesView` reads `?c=<conversationId>` from the URL to pick the open thread.

- [ ] **Step 1: Write the types**

```ts
// app/_components/Messaging/MessagesView/types.ts
export type MessagesViewProps = {
  basePath: string; // "/dashboard/messages" | "/instructor/messages"
};
```

```ts
// app/_components/Messaging/MessagesView/components/Inbox/types.ts
import type { ConversationSummary } from "@/server/entities/messaging/messaging.dto";

export type InboxProps = {
  conversations: ConversationSummary[];
  isLoading: boolean;
  activeId: string | null;
  onSelect: (conversationId: string) => void;
};
```

```ts
// app/_components/Messaging/MessagesView/components/Thread/types.ts
export type ThreadProps = {
  conversationId: string;
};
```

- [ ] **Step 2: Write the Inbox**

```tsx
// app/_components/Messaging/MessagesView/components/Inbox/index.tsx
"use client";

import { cn } from "@/lib/utils/cn";
import type { InboxProps } from "./types";

export function Inbox({
  conversations,
  isLoading,
  activeId,
  onSelect,
}: InboxProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {isLoading && (
        <p className="p-4 text-muted-foreground text-sm">Loading…</p>
      )}
      {!isLoading && conversations.length === 0 && (
        <p className="p-4 text-muted-foreground text-sm">No conversations yet.</p>
      )}
      {!isLoading &&
        conversations.map((c) => (
          <button
            className={cn(
              "flex flex-col gap-1 border-b px-4 py-3 text-left transition-colors hover:bg-accent/50",
              activeId === c.id && "bg-accent",
            )}
            key={c.id}
            onClick={() => onSelect(c.id)}
            type="button"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">
                {c.otherParticipantName}
              </span>
              {c.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-primary-foreground text-xs">
                  {c.unreadCount > 9 ? "9+" : c.unreadCount}
                </span>
              )}
            </div>
            <span className="text-muted-foreground text-xs">{c.courseTitle}</span>
            <span className="truncate text-muted-foreground text-xs">
              {c.lastMessagePreview}
            </span>
          </button>
        ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the Thread (messages + composer)**

```tsx
// app/_components/Messaging/MessagesView/components/Thread/index.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { api } from "@/trpc/client";
import type { ThreadProps } from "./types";

export function Thread({ conversationId }: ThreadProps) {
  const [draft, setDraft] = useState("");
  const utils = api.useUtils();
  const bottomRef = useRef<HTMLDivElement>(null);

  const thread = api.message.getThread.useQuery(
    { conversationId },
    { refetchInterval: 10_000 },
  );

  const markRead = api.message.markRead.useMutation({
    onSuccess: () => utils.message.listConversations.invalidate(),
  });

  const send = api.message.send.useMutation({
    onSuccess: () => {
      setDraft("");
      thread.refetch();
      utils.message.listConversations.invalidate();
    },
  });

  // Mark the thread read whenever it is opened or new messages arrive.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on id + message count
  useEffect(() => {
    markRead.mutate({ conversationId });
  }, [conversationId, thread.data?.messages.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.data?.messages.length]);

  function submit() {
    const body = draft.trim();
    if (!body) return;
    send.mutate({ conversationId, body });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <p className="font-medium text-sm">
          {thread.data?.otherParticipantName ?? "…"}
        </p>
        <p className="text-muted-foreground text-xs">
          {thread.data?.courseTitle ?? ""}
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {thread.isLoading && (
          <p className="text-muted-foreground text-sm">Loading messages…</p>
        )}
        {thread.data?.messages.map((m) => (
          <div
            className={cn(
              "max-w-[75%] rounded-lg px-3 py-2 text-sm",
              m.isMine
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted",
            )}
            key={m.id}
          >
            {m.body}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t p-3">
        <input
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Write a message…"
          value={draft}
        />
        <button
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm disabled:opacity-50"
          disabled={send.isPending || draft.trim().length === 0}
          onClick={submit}
          type="button"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `MessagesView`**

```tsx
// app/_components/Messaging/MessagesView/index.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/client";
import { Inbox } from "./components/Inbox";
import { Thread } from "./components/Thread";
import type { MessagesViewProps } from "./types";

export default function MessagesView({ basePath }: MessagesViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");

  const conversations = api.message.listConversations.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  function select(conversationId: string) {
    router.replace(`${basePath}?c=${conversationId}`);
  }

  return (
    <div className="grid h-[calc(100vh-8rem)] grid-cols-[320px_1fr] overflow-hidden rounded-lg border">
      <div className="border-r">
        <Inbox
          activeId={activeId}
          conversations={conversations.data ?? []}
          isLoading={conversations.isLoading}
          onSelect={select}
        />
      </div>
      <div>
        {!activeId && (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Select a conversation
          </div>
        )}
        {activeId && <Thread conversationId={activeId} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the two route pages**

```tsx
// app/dashboard/messages/page.tsx
import MessagesView from "@/app/_components/Messaging/MessagesView";

export default function StudentMessagesPage() {
  return <MessagesView basePath="/dashboard/messages" />;
}
```

```tsx
// app/instructor/messages/page.tsx
import MessagesView from "@/app/_components/Messaging/MessagesView";

export default function InstructorMessagesPage() {
  return <MessagesView basePath="/instructor/messages" />;
}
```

- [ ] **Step 6: Verify typecheck, lint, build**

Run: `pnpm typecheck && pnpm check && pnpm build`
Expected: PASS — both routes compile; sidebar Messages links resolve (no more 404).

- [ ] **Step 7: Commit**

```bash
git add app/_components/Messaging app/dashboard/messages app/instructor/messages
git commit -m "feat(messages): inbox, thread and composer UI with polling"
```

---

### Task 10: Entry points (start a conversation)

**Files:**
- Create: `app/_components/Messaging/MessageInstructorButton/index.tsx` (client)
- Create: `app/_components/Messaging/MessageInstructorButton/types.ts`
- Create: `app/_components/Messaging/MessageStudentButton/index.tsx` (client)
- Create: `app/_components/Messaging/MessageStudentButton/types.ts`
- Modify: `app/_components/Course/components/MyCourses/components/EnrolledCourseCard/index.tsx`
- Modify: `app/_components/Instructor/Students/StudentDetailsDialog/index.tsx`

**Interfaces:**
- Consumes: `api.message.getOrCreateConversation` (Task 7).
- Produces: a student button (`{ courseId }`) routing to `/dashboard/messages?c=…`, and an instructor button (`{ courseId, studentId }`) routing to `/instructor/messages?c=…`.

- [ ] **Step 1: Write the student button**

```ts
// app/_components/Messaging/MessageInstructorButton/types.ts
export type MessageInstructorButtonProps = {
  courseId: string;
};
```

```tsx
// app/_components/Messaging/MessageInstructorButton/index.tsx
"use client";

import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/client";
import type { MessageInstructorButtonProps } from "./types";

export function MessageInstructorButton({
  courseId,
}: MessageInstructorButtonProps) {
  const router = useRouter();
  const open = api.message.getOrCreateConversation.useMutation({
    onSuccess: ({ conversationId }) =>
      router.push(`/dashboard/messages?c=${conversationId}`),
    onError: (error) => console.error("Failed to open conversation:", error),
  });

  return (
    <button
      className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
      disabled={open.isPending}
      onClick={() => open.mutate({ courseId })}
      type="button"
    >
      <MessageSquare className="h-4 w-4" />
      Message instructor
    </button>
  );
}
```

- [ ] **Step 2: Write the instructor button**

```ts
// app/_components/Messaging/MessageStudentButton/types.ts
export type MessageStudentButtonProps = {
  courseId: string;
  studentId: string;
};
```

```tsx
// app/_components/Messaging/MessageStudentButton/index.tsx
"use client";

import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/client";
import type { MessageStudentButtonProps } from "./types";

export function MessageStudentButton({
  courseId,
  studentId,
}: MessageStudentButtonProps) {
  const router = useRouter();
  const open = api.message.getOrCreateConversation.useMutation({
    onSuccess: ({ conversationId }) =>
      router.push(`/instructor/messages?c=${conversationId}`),
    onError: (error) => console.error("Failed to open conversation:", error),
  });

  return (
    <button
      className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
      disabled={open.isPending}
      onClick={() => open.mutate({ courseId, studentId })}
      type="button"
    >
      <MessageSquare className="h-4 w-4" />
      Message
    </button>
  );
}
```

- [ ] **Step 3: Mount the student button on the enrolled course card**

Open `app/_components/Course/components/MyCourses/components/EnrolledCourseCard/index.tsx`. Identify the course id available in props (e.g. `course.id`). Import and render the button in the card's action row:

```tsx
import { MessageInstructorButton } from "@/app/_components/Messaging/MessageInstructorButton";
```

```tsx
<MessageInstructorButton courseId={course.id} />
```

(Place it next to the existing "Continue"/"View" action. If the card's prop name differs, pass whatever holds the enrolled course id.)

- [ ] **Step 4: Mount the instructor button in the student details dialog**

Open `app/_components/Instructor/Students/StudentDetailsDialog/index.tsx`. Identify the student id and the course id in scope for the selected student. Import and render:

```tsx
import { MessageStudentButton } from "@/app/_components/Messaging/MessageStudentButton";
```

```tsx
<MessageStudentButton courseId={courseId} studentId={studentId} />
```

(Use the dialog's existing student/course fields. If a student is enrolled in multiple of the instructor's courses, use the course currently in context for that row/dialog.)

- [ ] **Step 5: Verify typecheck, lint, build**

Run: `pnpm typecheck && pnpm check && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/_components/Messaging/MessageInstructorButton app/_components/Messaging/MessageStudentButton app/_components/Course/components/MyCourses/components/EnrolledCourseCard app/_components/Instructor/Students/StudentDetailsDialog
git commit -m "feat(messages): add start-conversation entry points"
```

---

### Task 11: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS — including the three new integration test files.

- [ ] **Step 2: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm check && pnpm build`
Expected: all PASS.

- [ ] **Step 3: Manual smoke (see `validation.md`)**

Start `pnpm dev`, then exercise: student "Message instructor" → send → instructor sidebar badge increments → instructor opens thread (badge clears) → replies → student sees reply within ~10s. Confirm no duplicate thread when reopening the entry point.

- [ ] **Step 4: Final commit (if any lint autofixes)**

```bash
git add -A
git commit -m "chore(messages): verification pass" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- FR1 inbox → Task 9 (Inbox) + `listConversations` (Tasks 5/7). FR2 thread → Task 9 (Thread) + `getThread`. FR3/FR4 start conversation → Task 10 + `getOrCreateConversation`. FR5 uniqueness → Task 1 `@@unique` + Task 2 `getOrCreate`. FR6 composer → Task 9 + `send` (`sendMessageInput` trims/bounds). FR7 read state → `markReadFor` (Task 3) + `markRead` (Task 5) + Thread effect (Task 9). FR8 unread count → `getTotalUnreadForUser` (Task 3). FR9 polling → Task 9 `refetchInterval`. FR10 participant authz → `assertParticipant` (Task 5, test incl. IDOR). FR11 enrollment gate → `getOrCreateConversation` (Task 5, test). FR12 sidebar badge → Task 8. FR13 email → Task 6.
- NFRs: authz (Task 5 tests), N+1 (single-query inbox Task 2, indexed count Task 3), idempotency (Task 1 unique + Task 2 race catch, Task 3 transaction), XSS (plain-text render Task 9), observability (`logger.warn` Task 5).

**Placeholder scan:** every code step contains complete code; no TBD/TODO/"handle edge cases". The two entry-point mounts (Task 10 Steps 3–4) intentionally adapt to existing prop names — concrete imports + JSX are given.

**Type consistency:** `getOrCreateConversation` returns `{ conversationId }` everywhere (service, router, buttons). `ConversationInboxRow` (repo) → `ConversationSummary` (DTO, ISO date) mapping is explicit in `listConversations`. `ThreadView.messages` is `ThreadMessage[]` consumed by `Thread`. `findForNotification` → `MessageNotificationData` matches `fireNewMessage` field access (`conversation.student.email`, etc.). `unreadMessages` prop name consistent across Sidebar → `NavigationProps` → `resolveBadge`.

**Cross-task ordering note:** Task 5 imports `notificationService.fireNewMessage` from Task 6 — implement Task 6 before Task 5 (or stub the call), as flagged in Task 5.