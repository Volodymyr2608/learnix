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
