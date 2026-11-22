import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb, truncateAll } from "@/test/db";
import { findKeyPaths } from "@/test/deepKeys";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeOpenedLesson,
	makePayment,
	makeRefundRequest,
	makeSection,
	makeUser,
} from "@/test/factories";

const flag = vi.hoisted(() => ({ on: true }));
vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => flag.on,
}));

const callerFor = (id: string, role: Role = Role.STUDENT) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role }, session: { id: "s1" } },
	} as never);

const DAY = 24 * 60 * 60 * 1000;

const seed = async () => {
	const instructor = await makeUser({ role: "INSTRUCTOR" });
	const student = await makeUser();
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lessons = await Promise.all(
		[0, 1, 2, 3, 4, 5].map((order) =>
			makeLesson({ sectionId: section.id, order }),
		),
	);
	await makeEnrollment({ studentId: student.id, courseId: course.id });
	const payment = await makePayment({
		studentId: student.id,
		instructorId: instructor.id,
		courseId: course.id,
		amountCents: 4900,
		paidAt: new Date(Date.now() - DAY),
	});
	return { instructor, student, course, lessons, payment };
};

describe("refund.getForPayment", () => {
	beforeEach(async () => {
		flag.on = true;
		await truncateAll();
	});

	it("shows the student the form for their own refundable payment", async () => {
		const { student, payment } = await seed();

		const result = await callerFor(student.id).refund.getForPayment({
			paymentId: payment.id,
		});

		expect(result?.courseTitle).toBeTruthy();
		expect(result?.state).toMatchObject({
			kind: "form",
			amountCents: 4900,
			currency: "usd",
		});
	});

	it("names the threshold once the student opened too many lessons", async () => {
		const { student, payment, lessons } = await seed();
		for (const lesson of lessons.slice(0, 4))
			await makeOpenedLesson({ studentId: student.id, lessonId: lesson.id });

		const { state } = (await callerFor(student.id).refund.getForPayment({
			paymentId: payment.id,
		})) ?? { state: null };

		expect(state).toEqual({
			kind: "over_limit",
			exceeded: [{ condition: "threshold", openedCount: 4, threshold: 3 }],
		});
	});

	it("returns NOT_FOUND for another student's payment and writes nothing (AC-C1)", async () => {
		const { payment } = await seed();
		const other = await makeUser();

		await expect(
			callerFor(other.id).refund.getForPayment({ paymentId: payment.id }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await testDb.refundRequest.count()).toBe(0);
	});

	it("returns NOT_FOUND with the flag off (AC-C24)", async () => {
		const { student, payment } = await seed();
		flag.on = false;

		await expect(
			callerFor(student.id).refund.getForPayment({ paymentId: payment.id }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it.each([
		Role.INSTRUCTOR,
		Role.ADMIN,
	])("rejects a %s with FORBIDDEN", async (role) => {
		const { instructor, payment } = await seed();

		await expect(
			callerFor(instructor.id, role).refund.getForPayment({
				paymentId: payment.id,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects an input with extra keys", async () => {
		const { student, payment } = await seed();

		await expect(
			callerFor(student.id).refund.getForPayment({
				paymentId: payment.id,
				studentId: student.id,
			} as never),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("never carries Stripe's text or ids to the student (AC-C23)", async () => {
		const { student, payment, course } = await seed();
		await makeRefundRequest({
			paymentId: payment.id,
			studentId: student.id,
			courseId: course.id,
			decision: "auto_approved",
			refundState: "processing",
			refundError: "Your card was declined by the issuing bank",
			stripeRefundId: "re_secret",
		});

		const state = await callerFor(student.id).refund.getForPayment({
			paymentId: payment.id,
		});

		expect(state?.state).toMatchObject({ kind: "status", status: "processing" });
		for (const key of [
			"refundError",
			"stripeRefundId",
			"stripePaymentIntentId",
		])
			expect(findKeyPaths(state, key)).toEqual([]);
		expect(JSON.stringify(state)).not.toContain("declined");
		expect(JSON.stringify(state)).not.toContain("re_secret");
	});
});
