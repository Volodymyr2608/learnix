import { beforeEach, describe, expect, it, vi } from "vitest";

// Explicit mock objects per project convention (not vi.hoisted pattern)
const mockCourseRepo = {
	getCoursesStats: vi.fn(),
};
const mockEnrollmentRepo = {
	getInstructorStudentStats: vi.fn(),
};
const mockPaymentRepo = {
	getInstructorRevenueStats: vi.fn(),
};

vi.mock("@/server/repositories/course.repository", () => ({
	courseRepository: mockCourseRepo,
}));

vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));

vi.mock("@/server/repositories/payment.repository", () => ({
	paymentRepository: mockPaymentRepo,
}));

const { courseService } = await import("./course.service");

const INSTRUCTOR_ID = "instructor-1";

describe("CourseService.getCoursesStats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("assembles course, student, and revenue stats into one DTO", async () => {
		mockCourseRepo.getCoursesStats.mockResolvedValue({
			total: 10,
			draft: 2,
			published: 8,
			lastCourses: 1,
		});
		mockEnrollmentRepo.getInstructorStudentStats.mockResolvedValue({
			total: 1234,
			thisMonthNew: 87,
			lastMonthNew: 50,
		});
		mockPaymentRepo.getInstructorRevenueStats.mockResolvedValue({
			lifetimeGrossCents: 1_245_000,
			thisMonthGrossCents: 123_000,
			lastMonthGrossCents: 100_000,
		});

		const result = await courseService.getCoursesStats(INSTRUCTOR_ID);

		expect(result).toEqual({
			total: 10,
			draft: 2,
			published: 8,
			lastCourses: 1,
			students: { total: 1234, newThisMonth: 87 },
			revenue: { lifetimeGrossCents: 1_245_000, thisMonthGrossCents: 123_000 },
		});
		expect(mockCourseRepo.getCoursesStats).toHaveBeenCalledWith(INSTRUCTOR_ID);
		expect(mockEnrollmentRepo.getInstructorStudentStats).toHaveBeenCalledWith(
			INSTRUCTOR_ID,
		);
		expect(mockPaymentRepo.getInstructorRevenueStats).toHaveBeenCalledWith(
			INSTRUCTOR_ID,
		);
	});

	it("returns zeroed values for a brand-new instructor", async () => {
		mockCourseRepo.getCoursesStats.mockResolvedValue({
			total: 0,
			draft: 0,
			published: 0,
			lastCourses: 0,
		});
		mockEnrollmentRepo.getInstructorStudentStats.mockResolvedValue({
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});
		mockPaymentRepo.getInstructorRevenueStats.mockResolvedValue({
			lifetimeGrossCents: 0,
			thisMonthGrossCents: 0,
			lastMonthGrossCents: 0,
		});

		const result = await courseService.getCoursesStats(INSTRUCTOR_ID);

		expect(result).toEqual({
			total: 0,
			draft: 0,
			published: 0,
			lastCourses: 0,
			students: { total: 0, newThisMonth: 0 },
			revenue: { lifetimeGrossCents: 0, thisMonthGrossCents: 0 },
		});
	});

	it("rejects when a repository call fails", async () => {
		mockCourseRepo.getCoursesStats.mockResolvedValue({
			total: 0,
			draft: 0,
			published: 0,
			lastCourses: 0,
		});
		mockEnrollmentRepo.getInstructorStudentStats.mockRejectedValue(
			new Error("DB connection lost"),
		);
		mockPaymentRepo.getInstructorRevenueStats.mockResolvedValue({
			lifetimeGrossCents: 0,
			thisMonthGrossCents: 0,
			lastMonthGrossCents: 0,
		});

		await expect(courseService.getCoursesStats(INSTRUCTOR_ID)).rejects.toThrow(
			"DB connection lost",
		);
	});
});
