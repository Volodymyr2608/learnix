import { beforeEach, describe, expect, it, vi } from "vitest";

// Explicit mock objects per project convention (not vi.hoisted pattern)
const mockPaymentRepo = {
	getInstructorRevenueStats: vi.fn(),
	getRevenueGroupedByCourse: vi.fn(),
};
const mockEnrollmentRepo = {
	getInstructorStudentStats: vi.fn(),
	findRecentByInstructor: vi.fn(),
};
const mockReviewRepo = {
	getInstructorRatingStats: vi.fn(),
	getAvgRatingByCourseIds: vi.fn(),
	findRecentByInstructor: vi.fn(),
};
const mockCourseRepo = {
	getCoursesStats: vi.fn(),
	getCourseCardsByIds: vi.fn(),
};

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

const { instructorService } = await import("./instructor.service");

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

	it("rejects when a repository call fails", async () => {
		mockPaymentRepo.getInstructorRevenueStats.mockRejectedValue(
			new Error("DB connection lost"),
		);
		await expect(
			instructorService.getDashboardStats(INSTRUCTOR_ID),
		).rejects.toThrow("DB connection lost");
	});
});

describe("InstructorService.getTopPerformingCourses", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ranks by revenue, attaches students + rating, drops missing courses", async () => {
		mockPaymentRepo.getRevenueGroupedByCourse.mockResolvedValue([
			{ courseId: "c1", grossCents: 5000 },
			{ courseId: "c2", grossCents: 3000 },
			{ courseId: "gone", grossCents: 1000 },
		]);
		mockCourseRepo.getCourseCardsByIds.mockResolvedValue(
			new Map([
				["c1", { title: "C One", students: 10 }],
				["c2", { title: "C Two", students: 7 }],
				// "gone" omitted → soft-deleted, must be dropped
			]),
		);
		mockReviewRepo.getAvgRatingByCourseIds.mockResolvedValue(
			new Map([["c1", 4.5]]), // c2 has no reviews → null
		);

		const result = await instructorService.getTopPerformingCourses("i1");

		expect(result).toEqual([
			{
				courseId: "c1",
				title: "C One",
				students: 10,
				rating: 4.5,
				grossCents: 5000,
			},
			{
				courseId: "c2",
				title: "C Two",
				students: 7,
				rating: null,
				grossCents: 3000,
			},
		]);
	});

	it("returns [] when the instructor has no revenue", async () => {
		mockPaymentRepo.getRevenueGroupedByCourse.mockResolvedValue([]);
		const result = await instructorService.getTopPerformingCourses("i1");
		expect(result).toEqual([]);
		expect(mockCourseRepo.getCourseCardsByIds).not.toHaveBeenCalled();
	});

	it("breaks revenue ties by students desc, then title asc", async () => {
		mockPaymentRepo.getRevenueGroupedByCourse.mockResolvedValue([
			{ courseId: "a", grossCents: 1000 },
			{ courseId: "b", grossCents: 1000 },
			{ courseId: "c", grossCents: 1000 },
		]);
		mockCourseRepo.getCourseCardsByIds.mockResolvedValue(
			new Map([
				["a", { title: "Zeta", students: 5 }],
				["b", { title: "Alpha", students: 5 }],
				["c", { title: "Beta", students: 9 }],
			]),
		);
		mockReviewRepo.getAvgRatingByCourseIds.mockResolvedValue(new Map());

		const result = await instructorService.getTopPerformingCourses("i1");
		expect(result.map((r) => r.courseId)).toEqual(["c", "b", "a"]);
	});
});

describe("InstructorService.getRecentActivity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("merges enrollments and reviews newest-first and caps the count", async () => {
		mockEnrollmentRepo.findRecentByInstructor.mockResolvedValue([
			{
				id: "e1",
				studentName: "Ann",
				courseTitle: "Course A",
				enrolledAt: new Date("2026-03-03T00:00:00Z"),
			},
			{
				id: "e2",
				studentName: "Bob",
				courseTitle: "Course B",
				enrolledAt: new Date("2026-03-01T00:00:00Z"),
			},
		]);
		mockReviewRepo.findRecentByInstructor.mockResolvedValue([
			{
				id: "r1",
				studentName: "Cara",
				courseTitle: "Course A",
				rating: 5,
				createdAt: new Date("2026-03-02T00:00:00Z"),
			},
		]);

		const result = await instructorService.getRecentActivity("i1", 2);

		expect(result).toEqual([
			{
				type: "enrollment",
				id: "e1",
				studentName: "Ann",
				courseTitle: "Course A",
				occurredAt: new Date("2026-03-03T00:00:00Z"),
			},
			{
				type: "review",
				id: "r1",
				studentName: "Cara",
				courseTitle: "Course A",
				rating: 5,
				occurredAt: new Date("2026-03-02T00:00:00Z"),
			},
		]);
	});

	it("returns [] when there is no activity", async () => {
		mockEnrollmentRepo.findRecentByInstructor.mockResolvedValue([]);
		mockReviewRepo.findRecentByInstructor.mockResolvedValue([]);
		const result = await instructorService.getRecentActivity("i1");
		expect(result).toEqual([]);
	});
});
