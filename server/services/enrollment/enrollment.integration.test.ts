import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnrollmentStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";

vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: {
		recomputeUserInterest: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send: vi.fn().mockResolvedValue(undefined) },
}));

const { enrollmentService } = await import("./enrollment.service");
const { embeddingsService } = await import(
	"@/server/services/embeddings/embeddings.service"
);

describe("EnrollmentService.enrollInCourse", () => {
	beforeEach(() => vi.clearAllMocks());

	it("enrolls a student in a published course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await enrollmentService.enrollInCourse(student.id, course.id);

		const enrollment = await testDb.enrollment.findFirst({
			where: { studentId: student.id, courseId: course.id },
		});
		expect(enrollment?.status).toBe(EnrollmentStatus.active);
	});

	it("rejects enrolling in your own course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await expect(
			enrollmentService.enrollInCourse(instructor.id, course.id),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("re-activates a cancelled enrollment without creating a duplicate", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await testDb.enrollment.create({
			data: {
				studentId: student.id,
				courseId: course.id,
				status: EnrollmentStatus.cancelled,
			},
		});

		await enrollmentService.enrollInCourse(student.id, course.id);

		const rows = await testDb.enrollment.findMany({
			where: { studentId: student.id, courseId: course.id },
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe(EnrollmentStatus.active);
	});

	it("triggers a user-interest recompute on enrollment", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await enrollmentService.enrollInCourse(student.id, course.id);
		await vi.waitFor(() =>
			expect(embeddingsService.recomputeUserInterest).toHaveBeenCalledWith(
				student.id,
			),
		);
	});
});
