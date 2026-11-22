import { beforeEach, describe, expect, it, vi } from "vitest";

const repos = vi.hoisted(() => ({
	findUserInterest: vi.fn(),
	searchCoursesExcluding: vi.fn(),
	findAnyEnrollmentCourseIds: vi.fn(),
	findManyByIdsPreservingOrder: vi.fn(),
}));

vi.mock("@/server/repositories/embedding.repository", () => ({
	embeddingRepository: {
		findUserInterest: repos.findUserInterest,
		searchCoursesExcluding: repos.searchCoursesExcluding,
	},
}));
vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: {
		findAnyEnrollmentCourseIds: repos.findAnyEnrollmentCourseIds,
	},
}));
vi.mock("@/server/repositories/course.repository", () => ({
	courseRepository: {
		findManyByIdsPreservingOrder: repos.findManyByIdsPreservingOrder,
	},
}));

const { recommendationsService } = await import("./recommendations.service");

describe("recommendationsService.forUser (REC)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		repos.findUserInterest.mockResolvedValue([0.1, 0.2]);
		repos.searchCoursesExcluding.mockResolvedValue([
			{ id: "c1" },
			{ id: "c2" },
			{ id: "c3" },
		]);
		repos.findManyByIdsPreservingOrder.mockResolvedValue([]);
	});

	it("excludes every course the student has an enrollment for, refunded ones included", async () => {
		repos.findAnyEnrollmentCourseIds.mockResolvedValue(["active", "refunded"]);

		await recommendationsService.forUser("student-1");

		expect(repos.findAnyEnrollmentCourseIds).toHaveBeenCalledWith("student-1");
		expect(repos.searchCoursesExcluding).toHaveBeenCalledWith([0.1, 0.2], 10, [
			"active",
			"refunded",
		]);
	});
});
