import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnrollmentStatus, ReviewTag } from "@/generated/prisma";

// Explicit mock objects per project convention (not vi.hoisted pattern)
const mockEnrollmentRepo = { findByStudentCourse: vi.fn() };
const mockReviewRepo = {
	findByStudentAndCourse: vi.fn(),
	create: vi.fn(),
};
const mockCourseRepo = { findFirst: vi.fn() };

vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));
vi.mock("@/server/repositories/courseReview.repository", () => ({
	courseReviewRepository: mockReviewRepo,
}));
vi.mock("@/server/repositories/course.repository", () => ({
	courseRepository: mockCourseRepo,
}));

const { reviewService } = await import("./review.service");

const courseRow = {
	id: "course_1",
	title: "Python",
	duration: "15 hours",
	instructor: { name: "David Kim" },
	sections: [
		{ lessons: [{ id: "l1" }, { id: "l2" }] },
		{ lessons: [{ id: "l3" }] },
	],
};

const completedEnrollment = {
	status: EnrollmentStatus.completed,
	completedAt: new Date("2024-03-15T00:00:00Z"),
};

beforeEach(() => {
	vi.clearAllMocks();
	mockCourseRepo.findFirst.mockResolvedValue(courseRow);
});

describe("reviewService.getEligibility", () => {
	it("returns ineligible when there is no enrollment", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue(null);

		const result = await reviewService.getEligibility("stu_1", "course_1");

		expect(result).toEqual({ state: "ineligible" });
	});

	it("returns ineligible when the enrollment is not completed", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue({
			status: EnrollmentStatus.active,
			completedAt: new Date(),
		});

		const result = await reviewService.getEligibility("stu_1", "course_1");

		expect(result).toEqual({ state: "ineligible" });
	});

	it("returns eligible with a course summary when completed and not reviewed", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue(
			completedEnrollment,
		);
		mockReviewRepo.findByStudentAndCourse.mockResolvedValue(null);

		const result = await reviewService.getEligibility("stu_1", "course_1");

		expect(result.state).toBe("eligible");
		if (result.state !== "eligible") throw new Error("unreachable");
		expect(result.course.totalLessons).toBe(3);
		expect(result.course.instructor).toBe("David Kim");
	});

	it("returns alreadyReviewed with the existing review", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue(
			completedEnrollment,
		);
		mockReviewRepo.findByStudentAndCourse.mockResolvedValue({
			rating: 4,
			comment: "great",
			tags: [ReviewTag.PACE],
			createdAt: new Date("2024-03-16T00:00:00Z"),
		});

		const result = await reviewService.getEligibility("stu_1", "course_1");

		expect(result.state).toBe("alreadyReviewed");
		if (result.state !== "alreadyReviewed") throw new Error("unreachable");
		expect(result.review.rating).toBe(4);
		expect(result.review.tags).toEqual([ReviewTag.PACE]);
	});
});

describe("reviewService.createReview", () => {
	const input = {
		courseId: "course_1",
		rating: 5,
		comment: "x".repeat(50),
		tags: [ReviewTag.INSTRUCTOR],
	};

	it("throws FORBIDDEN when the student has not completed the course", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue({
			status: EnrollmentStatus.active,
			completedAt: new Date(),
		});

		await expect(
			reviewService.createReview("stu_1", input),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockReviewRepo.create).not.toHaveBeenCalled();
	});

	it("throws CONFLICT when a review already exists", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue(
			completedEnrollment,
		);
		mockReviewRepo.findByStudentAndCourse.mockResolvedValue({ id: "rev_1" });

		await expect(
			reviewService.createReview("stu_1", input),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(mockReviewRepo.create).not.toHaveBeenCalled();
	});

	it("creates the review and returns its id", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue(
			completedEnrollment,
		);
		mockReviewRepo.findByStudentAndCourse.mockResolvedValue(null);
		mockReviewRepo.create.mockResolvedValue({ id: "rev_new" });

		const result = await reviewService.createReview("stu_1", input);

		expect(result).toEqual({ id: "rev_new" });
		expect(mockReviewRepo.create).toHaveBeenCalledWith({
			studentId: "stu_1",
			courseId: "course_1",
			rating: 5,
			comment: input.comment,
			tags: [ReviewTag.INSTRUCTOR],
		});
	});
});
