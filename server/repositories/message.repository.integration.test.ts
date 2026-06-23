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