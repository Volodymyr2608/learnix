import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeOpenedLesson,
	makePayment,
	makeRefundRequest,
	makeSection,
	makeUser,
} from "@/test/factories";

describe("refund schema", () => {
	let studentId: string;
	let courseId: string;
	let paymentId: string;
	let lessonId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		studentId = student.id;
		courseId = course.id;
		paymentId = payment.id;
		lessonId = lesson.id;
	});

	it("stores paidAt on a payment", async () => {
		const payment = await testDb.payment.findUniqueOrThrow({
			where: { id: paymentId },
		});
		expect(payment.paidAt).toBeInstanceOf(Date);
	});

	it("allows at most one refund request per payment", async () => {
		await makeRefundRequest({ paymentId, studentId, courseId });
		await expect(
			makeRefundRequest({ paymentId, studentId, courseId }),
		).rejects.toMatchObject({ code: "P2002" });
	});

	it("records an opened lesson once per student", async () => {
		await makeOpenedLesson({ studentId, lessonId });
		await expect(
			makeOpenedLesson({ studentId, lessonId }),
		).rejects.toMatchObject({ code: "P2002" });
	});

	it("truncateAll empties the new tables", async () => {
		await makeRefundRequest({ paymentId, studentId, courseId });
		await makeOpenedLesson({ studentId, lessonId });
		await truncateAll();
		expect(await testDb.refundRequest.count()).toBe(0);
		expect(await testDb.openedLesson.count()).toBe(0);
	});
});
