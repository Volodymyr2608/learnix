import { afterEach, describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { testDb, truncateAll } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";
import { conversationRepository } from "./conversation.repository";

describe("ConversationRepository.getOrCreate", () => {
	afterEach(async () => {
		await truncateAll();
	});

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
	afterEach(async () => {
		await truncateAll();
	});

	it("returns threads newest-first with other participant, preview and unread count", async () => {
		const instructor = await makeUser({
			role: Role.INSTRUCTOR,
			name: "Dr Who",
		});
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
			data: {
				conversationId: convo.id,
				senderId: instructor.id,
				body: "Welcome!",
			},
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
