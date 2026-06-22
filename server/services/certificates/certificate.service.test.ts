import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnrollmentRepo = {
	findCompletedByStudent: vi.fn(),
};

vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));
// renderPdf pulls in @react-pdf/renderer + the Certificate component; stub the
// React PDF document so importing the service stays cheap and DOM-free.
vi.mock("@/app/_components/Certificate", () => ({
	CertificateDocument: () => null,
}));

const { certificateService } = await import("./certificate.service");

describe("CertificateService.listEarned", () => {
	beforeEach(() => vi.clearAllMocks());

	it("maps completed enrollments to EarnedCertificate DTOs", async () => {
		const completedAt = new Date("2026-06-20T10:00:00Z");
		mockEnrollmentRepo.findCompletedByStudent.mockResolvedValue([
			{
				id: "enr-1",
				courseId: "course-1",
				completedAt,
				course: { title: "TypeScript Pro", instructor: { name: "Ada" } },
			},
		]);

		const result = await certificateService.listEarned("student-1");

		expect(mockEnrollmentRepo.findCompletedByStudent).toHaveBeenCalledWith(
			"student-1",
		);
		expect(result).toEqual([
			{
				enrollmentId: "enr-1",
				courseId: "course-1",
				courseTitle: "TypeScript Pro",
				instructorName: "Ada",
				completedAt,
			},
		]);
	});

	it("returns an empty array when the student has no completed enrollments", async () => {
		mockEnrollmentRepo.findCompletedByStudent.mockResolvedValue([]);
		expect(await certificateService.listEarned("student-1")).toEqual([]);
	});
});
