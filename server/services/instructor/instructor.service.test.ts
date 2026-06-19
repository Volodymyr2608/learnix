import { beforeEach, describe, expect, it, vi } from "vitest";

// Explicit mock objects per project convention (not vi.hoisted pattern)
const mockPaymentRepo = {
	getInstructorRevenueStats: vi.fn(),
	getRevenueGroupedByCourse: vi.fn(),
};
const mockEnrollmentRepo = {
	getInstructorStudentStats: vi.fn(),
	findRecentByInstructor: vi.fn(),
	findInstructorStudents: vi.fn(),
	getInstructorStudentStatusCounts: vi.fn(),
};
const mockReviewRepo = {
	getInstructorRatingStats: vi.fn(),
	getAvgRatingByCourseIds: vi.fn(),
	findRecentByInstructor: vi.fn(),
	getInstructorReviewStats: vi.fn(),
	findInstructorReviews: vi.fn(),
	getInstructorReviewCourseOptions: vi.fn(),
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

describe("InstructorService.getStudents", () => {
	beforeEach(() => vi.clearAllMocks());

	it("maps repo rows to StudentRow DTOs and computes pagination", async () => {
		mockEnrollmentRepo.findInstructorStudents.mockResolvedValue({
			rows: [
				{
					id: "u1",
					name: "Ann",
					email: "ann@example.com",
					image: null,
					progress: 50,
					last_active_at: new Date("2026-06-15T00:00:00Z"),
					joined_at: new Date("2026-06-01T00:00:00Z"),
					status: "active",
					courses: [
						{ courseId: "c1", title: "C1", progress: 50, completed: false },
					],
				},
			],
			total: 23,
		});

		const result = await instructorService.getStudents(INSTRUCTOR_ID, {
			status: "all",
			sort: "recent",
			page: 2,
		});

		expect(result.total).toBe(23);
		expect(result.currentPage).toBe(2);
		expect(result.perPage).toBe(10);
		expect(result.lastPage).toBe(3); // ceil(23/10)
		expect(result.data[0]).toMatchObject({
			id: "u1",
			overallProgress: 50,
			lastActiveAt: new Date("2026-06-15T00:00:00Z"),
			joinedAt: new Date("2026-06-01T00:00:00Z"),
			status: "active",
		});
		// cutoff passed to repo is ~7 days before now
		const [firstCall] = mockEnrollmentRepo.findInstructorStudents.mock.calls;
		const cutoff = (firstCall?.[0] as { cutoff: Date }).cutoff;
		const daysAgo = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
		expect(Math.round(daysAgo)).toBe(7);
	});

	it("returns lastPage of 1 when there are no students", async () => {
		mockEnrollmentRepo.findInstructorStudents.mockResolvedValue({
			rows: [],
			total: 0,
		});
		const result = await instructorService.getStudents(INSTRUCTOR_ID, {
			status: "all",
			sort: "recent",
			page: 1,
		});
		expect(result).toMatchObject({ total: 0, lastPage: 1, data: [] });
	});
});

describe("InstructorService.getStudentStatusCounts", () => {
	it("returns the counts from the repository", async () => {
		mockEnrollmentRepo.getInstructorStudentStatusCounts.mockResolvedValue({
			total: 5,
			active: 3,
			completed: 1,
			inactive: 1,
		});
		const counts =
			await instructorService.getStudentStatusCounts(INSTRUCTOR_ID);
		expect(counts).toEqual({ total: 5, active: 3, completed: 1, inactive: 1 });
	});
});

describe("InstructorService.getReviewStats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shapes distribution (5..1) and rounds fiveStarPercent", async () => {
		mockReviewRepo.getInstructorReviewStats.mockResolvedValue({
			average: 4.25,
			total: 4,
			fiveStarCount: 2,
			lowRatingCount: 1,
			perStar: new Map([
				[5, 2],
				[4, 1],
				[2, 1],
			]),
		});

		const stats = await instructorService.getReviewStats(INSTRUCTOR_ID, {});

		expect(stats.average).toBe(4.25);
		expect(stats.total).toBe(4);
		expect(stats.fiveStarPercent).toBe(50);
		expect(stats.lowRatingCount).toBe(1);
		expect(stats.distribution.map((d) => d.star)).toEqual([5, 4, 3, 2, 1]);
		expect(stats.distribution[0]).toMatchObject({
			star: 5,
			count: 2,
			percent: 50,
		});
		expect(stats.distribution[4]).toMatchObject({
			star: 1,
			count: 0,
			percent: 0,
		});
	});

	it("returns null average and zeroed fields with no reviews", async () => {
		mockReviewRepo.getInstructorReviewStats.mockResolvedValue({
			average: null,
			total: 0,
			fiveStarCount: 0,
			lowRatingCount: 0,
			perStar: new Map(),
		});

		const stats = await instructorService.getReviewStats(INSTRUCTOR_ID, {});

		expect(stats.average).toBeNull();
		expect(stats.fiveStarPercent).toBe(0);
		expect(
			stats.distribution.every((d) => d.count === 0 && d.percent === 0),
		).toBe(true);
	});

	it("passes courseId through to the repository", async () => {
		mockReviewRepo.getInstructorReviewStats.mockResolvedValue({
			average: null,
			total: 0,
			fiveStarCount: 0,
			lowRatingCount: 0,
			perStar: new Map(),
		});

		await instructorService.getReviewStats(INSTRUCTOR_ID, {
			courseId: "course-1",
		});

		expect(mockReviewRepo.getInstructorReviewStats).toHaveBeenCalledWith(
			INSTRUCTOR_ID,
			"course-1",
		);
	});
});

describe("InstructorService.getReviews", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("wraps repository rows in pagination metadata", async () => {
		mockReviewRepo.findInstructorReviews.mockResolvedValue({
			rows: [],
			total: 23,
		});

		const result = await instructorService.getReviews(INSTRUCTOR_ID, {
			page: 2,
		});

		expect(result).toMatchObject({
			total: 23,
			currentPage: 2,
			perPage: 10,
			lastPage: 3,
		});
	});

	it("returns lastPage of 1 when there are no reviews", async () => {
		mockReviewRepo.findInstructorReviews.mockResolvedValue({
			rows: [],
			total: 0,
		});

		const result = await instructorService.getReviews(INSTRUCTOR_ID, {
			page: 1,
		});

		expect(result).toMatchObject({ total: 0, lastPage: 1, data: [] });
	});
});

describe("InstructorService.getReviewCourseOptions", () => {
	it("returns the options from the repository sorted by title", async () => {
		mockReviewRepo.getInstructorReviewCourseOptions.mockResolvedValue([
			{ id: "c2", title: "Zeta" },
			{ id: "c1", title: "Alpha" },
		]);

		const options =
			await instructorService.getReviewCourseOptions(INSTRUCTOR_ID);

		expect(options).toEqual([
			{ id: "c1", title: "Alpha" },
			{ id: "c2", title: "Zeta" },
		]);
	});
});
