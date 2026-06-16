import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPaymentRepo, mockEnrollmentRepo, mockReviewRepo, mockCourseRepo } =
	vi.hoisted(() => ({
		mockPaymentRepo: { getInstructorRevenueStats: vi.fn() },
		mockEnrollmentRepo: { getInstructorStudentStats: vi.fn() },
		mockReviewRepo: { getInstructorRatingStats: vi.fn() },
		mockCourseRepo: { getCoursesStats: vi.fn() },
	}));

vi.mock("@/server/repositories/payment.repository", () => ({
	paymentRepository: mockPaymentRepo,
}));

vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));

vi.mock("@/server/repositories/courseReview.repository", () => ({
	courseReviewRepository: mockReviewRepo,
}));

vi.mock("@/server/repositories/course.repository", () => ({
	courseRepository: mockCourseRepo,
}));

import { instructorService } from "./instructor.service";

const INSTRUCTOR_ID = "instructor-1";

describe("InstructorService.getDashboardStats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("assembles real stats and computes deltas", async () => {
		mockPaymentRepo.getInstructorRevenueStats.mockResolvedValue({
			lifetimeGrossCents: 1_245_000,
			thisMonthGrossCents: 110_000,
			lastMonthGrossCents: 100_000,
		});
		mockEnrollmentRepo.getInstructorStudentStats.mockResolvedValue({
			total: 1234,
			thisMonthNew: 13,
			lastMonthNew: 12,
		});
		mockReviewRepo.getInstructorRatingStats.mockResolvedValue({
			average: 4.8,
			reviewCount: 245,
		});
		mockCourseRepo.getCoursesStats.mockResolvedValue({
			published: 8,
			draft: 2,
			total: 10,
			lastCourses: 1,
		});

		const result = await instructorService.getDashboardStats(INSTRUCTOR_ID);

		expect(result).toEqual({
			revenue: {
				totalCents: 1_245_000,
				delta: { kind: "percent", value: 10, direction: "up" },
			},
			students: {
				total: 1234,
				delta: { kind: "percent", value: 8, direction: "up" },
			},
			courses: { published: 8, drafts: 2 },
			rating: { average: 4.8, reviewCount: 245 },
		});
	});

	it("returns empty-state values for a brand-new instructor", async () => {
		mockPaymentRepo.getInstructorRevenueStats.mockResolvedValue({
			lifetimeGrossCents: 0,
			thisMonthGrossCents: 0,
			lastMonthGrossCents: 0,
		});
		mockEnrollmentRepo.getInstructorStudentStats.mockResolvedValue({
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});
		mockReviewRepo.getInstructorRatingStats.mockResolvedValue({
			average: null,
			reviewCount: 0,
		});
		mockCourseRepo.getCoursesStats.mockResolvedValue({
			published: 0,
			draft: 0,
			total: 0,
			lastCourses: 0,
		});

		const result = await instructorService.getDashboardStats(INSTRUCTOR_ID);

		expect(result).toEqual({
			revenue: { totalCents: 0, delta: { kind: "none" } },
			students: { total: 0, delta: { kind: "none" } },
			courses: { published: 0, drafts: 0 },
			rating: { average: null, reviewCount: 0 },
		});
	});
});
