import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb, truncateAll } from "@/test/db";
import { makeCourse, makeEnrollment, makeUser } from "@/test/factories";

vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send: async () => undefined },
}));

const callerFor = (id: string) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role: Role.STUDENT }, session: { id: "s1" } },
	} as never);

describe("course.enroll is for free courses only (audit High)", () => {
	let studentId: string;
	let instructorId: string;

	beforeEach(async () => {
		await truncateAll();
		instructorId = (await makeUser({ role: Role.INSTRUCTOR })).id;
		studentId = (await makeUser()).id;
	});

	it("refuses to re-activate a refunded paid enrollment and changes nothing", async () => {
		const course = await makeCourse({
			instructorId,
			status: "published",
			priceCents: 4999,
		});
		const enrollment = await makeEnrollment({
			studentId,
			courseId: course.id,
			status: "cancelled",
			certificateRevokedAt: new Date(),
			certificateRevokedReason: "refund_request",
		});

		await expect(
			callerFor(studentId).course.enroll(course.id),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(
			await testDb.enrollment.findUniqueOrThrow({
				where: { id: enrollment.id },
			}),
		).toMatchObject({
			status: "cancelled",
			certificateRevokedReason: "refund_request",
		});
	});

	it("refuses a first enrollment in a paid course", async () => {
		const course = await makeCourse({
			instructorId,
			status: "published",
			priceCents: 4999,
		});

		await expect(
			callerFor(studentId).course.enroll(course.id),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(await testDb.enrollment.count()).toBe(0);
	});

	it("still enrolls in a free course", async () => {
		const course = await makeCourse({
			instructorId,
			status: "published",
			priceCents: 0,
		});

		await callerFor(studentId).course.enroll(course.id);

		expect(
			await testDb.enrollment.count({
				where: { studentId, courseId: course.id },
			}),
		).toBe(1);
	});
});
