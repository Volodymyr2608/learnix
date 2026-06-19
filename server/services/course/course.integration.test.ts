import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeCourse, makeSection, makeUser } from "@/test/factories";

vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: {
		embedCourse: vi.fn().mockResolvedValue(undefined),
		removeCourseEmbedding: vi.fn().mockResolvedValue(undefined),
		recomputeUserInterest: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("@/server/services/versel/vercel.service", () => ({
	vercelService: {
		deleteFileFromVercelStorage: vi.fn().mockResolvedValue({ success: true }),
		uploadFileToVercelStorage: vi.fn().mockResolvedValue({ url: null }),
	},
}));

const { courseService } = await import("./course.service");
const { embeddingsService } = await import(
	"@/server/services/embeddings/embeddings.service"
);

describe("CourseService publish", () => {
	beforeEach(() => vi.clearAllMocks());

	it("transitions a draft course to published and triggers embedding", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.draft,
		});

		// Create a section with a lesson so the update DTO is valid
		const section = await makeSection({ courseId: course.id, order: 1 });
		await testDb.lesson.create({
			data: { sectionId: section.id, title: "Lesson 1", order: 1 },
		});

		await courseService.updateCourse(
			course.id,
			{
				id: course.id,
				title: course.title,
				subtitle: null,
				description: course.description ?? "Test course description",
				category: course.category,
				level: course.level,
				language: course.language,
				duration: course.duration,
				priceCents: course.priceCents,
				originalPriceCents: null,
				status: "published",
				objectives: [],
				requirements: [],
				thumbnailUrl: null,
				previewVideoUrl: null,
				instructorId: instructor.id,
				sections: [
					{
						id: section.id,
						title: section.title,
						order: 1,
						lessons: [{ title: "Lesson 1" }],
					},
				],
			},
			instructor.id,
		);

		const updated = await testDb.course.findUnique({
			where: { id: course.id },
		});
		expect(updated?.status).toBe(CourseStatus.published);

		await vi.waitFor(() =>
			expect(embeddingsService.embedCourse).toHaveBeenCalled(),
		);
	});
});

describe("CourseService.searchOwnCourses", () => {
	it("delegates to the repository and stays scoped to the instructor", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id, title: "Mine" });
		await makeCourse({ instructorId: other.id, title: "Theirs" });

		const res = await courseService.searchOwnCourses(instructor.id, {
			status: "all",
			sort: "updated",
			page: 1,
		});

		expect(res.total).toBe(1);
		expect(res.data[0]?.title).toBe("Mine");
	});

	it("attaches real rating and revenue per course, defaulting to null/0 when absent", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const rated = await makeCourse({
			instructorId: instructor.id,
			title: "Rated",
		});
		const unrated = await makeCourse({
			instructorId: instructor.id,
			title: "Unrated",
		});
		const reviewer1 = await makeUser({ role: Role.STUDENT });
		const reviewer2 = await makeUser({ role: Role.STUDENT });
		const payer = await makeUser({ role: Role.STUDENT });

		await testDb.courseReview.create({
			data: {
				courseId: rated.id,
				studentId: reviewer1.id,
				rating: 5,
				comment: "great",
			},
		});
		await testDb.courseReview.create({
			data: {
				courseId: rated.id,
				studentId: reviewer2.id,
				rating: 3,
				comment: "ok",
			},
		});
		await testDb.payment.create({
			data: {
				studentId: payer.id,
				instructorId: instructor.id,
				courseId: rated.id,
				amountCents: 4000,
				status: "succeeded",
			},
		});

		const res = await courseService.searchOwnCourses(instructor.id, {
			status: "all",
			sort: "title",
			page: 1,
		});

		const byTitle = new Map(res.data.map((c) => [c.title, c]));
		expect(byTitle.get("Rated")).toMatchObject({
			rating: 4,
			revenueCents: 4000,
		});
		expect(byTitle.get("Unrated")).toMatchObject({
			rating: null,
			revenueCents: 0,
		});
	});
});
