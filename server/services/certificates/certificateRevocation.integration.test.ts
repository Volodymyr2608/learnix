import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/certificates/[enrollmentId]/route";
import { signCertificateToken } from "@/server/services/notifications/auth";
import { testDb, truncateAll } from "@/test/db";
import { makeCourse, makeEnrollment, makeUser } from "@/test/factories";

vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send: async () => undefined },
}));

const { certificateService } = await import("./certificate.service");
const { CertificateNotFoundError } = await import("./certificate.errors");
const { enrollmentService } = await import(
	"@/server/services/enrollment/enrollment.service"
);

describe("revoked certificates are not served (C25, FR-P10)", () => {
	let studentId: string;
	let courseId: string;
	let enrollmentId: string;

	const revoke = () =>
		testDb.enrollment.update({
			where: { id: enrollmentId },
			data: {
				status: "cancelled",
				certificateRevokedAt: new Date(),
				certificateRevokedReason: "dashboard_refund",
			},
		});

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		studentId = (await makeUser()).id;
		courseId = (
			await makeCourse({ instructorId: instructor.id, status: "published" })
		).id;
		enrollmentId = (
			await makeEnrollment({
				studentId,
				courseId,
				status: "completed",
				completedAt: new Date(),
			})
		).id;
	});

	it("drops a revoked certificate from the student's list", async () => {
		expect(await certificateService.listEarned(studentId)).toHaveLength(1);
		await revoke();
		expect(await certificateService.listEarned(studentId)).toEqual([]);
	});

	it("refuses to render a revoked certificate", async () => {
		await revoke();
		await expect(
			certificateService.renderPdf(enrollmentId),
		).rejects.toBeInstanceOf(CertificateNotFoundError);
	});

	it("returns 404 for a revoked certificate even with a valid 30-day token", async () => {
		const token = await signCertificateToken(enrollmentId);
		await revoke();

		const res = await GET(
			new Request(
				`http://localhost/api/certificates/${enrollmentId}?token=${token}`,
			),
			{ params: Promise.resolve({ enrollmentId }) },
		);

		expect(res.status).toBe(404);
	});

	it("clears the revocation when the student buys the course again (R5)", async () => {
		await revoke();

		await enrollmentService.enrollInCourse(studentId, courseId);

		const enrollment = await testDb.enrollment.findUniqueOrThrow({
			where: { id: enrollmentId },
		});
		expect(enrollment).toMatchObject({
			status: "active",
			certificateRevokedAt: null,
			certificateRevokedReason: null,
		});
	});
});
