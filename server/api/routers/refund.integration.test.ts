import { describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makePayment,
	makeUser,
} from "@/test/factories";

vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => true,
}));

const callerFor = (id: string, role: Role) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role }, session: { id: "s1" } },
	} as never);

const seed = async () => {
	const instructor = await makeUser({ role: "INSTRUCTOR" });
	const student = await makeUser();
	const course = await makeCourse({ instructorId: instructor.id });
	await makeEnrollment({ studentId: student.id, courseId: course.id });
	const payment = await makePayment({
		studentId: student.id,
		instructorId: instructor.id,
		courseId: course.id,
	});
	return { instructor, student, payment };
};

describe("refund.request", () => {
	it("lets a student request, with the student id taken from the session", async () => {
		const { student, payment } = await seed();

		const result = await callerFor(student.id, Role.STUDENT).refund.request({
			paymentId: payment.id,
			reason: "too_easy",
		});

		expect(result?.decision).toBe("auto_approved");
		expect(
			await testDb.refundRequest.count({ where: { studentId: student.id } }),
		).toBe(1);
	});

	it.each([
		Role.INSTRUCTOR,
		Role.ADMIN,
	])("rejects a %s with FORBIDDEN", async (role) => {
		const { payment, instructor } = await seed();

		await expect(
			callerFor(instructor.id, role).refund.request({
				paymentId: payment.id,
				reason: "too_easy",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(await testDb.refundRequest.count()).toBe(0);
	});
});
