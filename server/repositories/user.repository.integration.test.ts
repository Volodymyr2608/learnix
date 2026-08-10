import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import {
	makeConversation,
	makeCourse,
	makeCourseReview,
	makeEnrollment,
	makeMessage,
	makePayment,
	makeUser,
} from "@/test/factories";

describe("CourseGeneration.instructorId foreign key", () => {
	it("rejects a generation whose instructor does not exist", async () => {
		await expect(
			testDb.courseGeneration.create({
				data: { instructorId: "no-such-user", content: {} },
			}),
		).rejects.toThrow();
	});

	it("accepts a generation for a real instructor", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });

		const generation = await testDb.courseGeneration.create({
			data: { instructorId: instructor.id, content: {} },
		});

		expect(generation.instructorId).toBe(instructor.id);
	});
});

describe("User relations that must never cascade", () => {
	it("refuses to delete an instructor who has a course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id });

		await expect(
			testDb.user.delete({ where: { id: instructor.id } }),
		).rejects.toThrow();

		expect(
			await testDb.user.findUnique({ where: { id: instructor.id } }),
		).not.toBeNull();
	});

	it("refuses to delete a student who has a payment, enrollment or review", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		await makeCourseReview({ courseId: course.id, studentId: student.id });

		await expect(
			testDb.user.delete({ where: { id: student.id } }),
		).rejects.toThrow();
	});

	it("refuses to delete either party to a conversation", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({ instructorId: instructor.id });
		const conversation = await makeConversation({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		await makeMessage({
			conversationId: conversation.id,
			senderId: student.id,
		});

		await expect(
			testDb.user.delete({ where: { id: student.id } }),
		).rejects.toThrow();
		await expect(
			testDb.user.delete({ where: { id: instructor.id } }),
		).rejects.toThrow();
	});
});
