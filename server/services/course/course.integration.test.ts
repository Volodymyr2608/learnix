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
