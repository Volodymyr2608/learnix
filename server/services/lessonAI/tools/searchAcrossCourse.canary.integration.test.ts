import { beforeEach, describe, expect, it, vi } from "vitest";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeOpenedLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const VECTOR = new Array(1536).fill(0.1) as number[];
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { embedQuery: async () => VECTOR },
}));

const { buildSearchAcrossCourseTool } = await import(
	"./searchAcrossCourse.tool"
);

/**
 * AC-L2 (G7): "Summarise lessons 4–10" with only lesson 1 opened must contain no fact found only
 * in lessons 2–N. Deterministic: one canary sentence per lesson, every chunk the same distance, the
 * real tool and the real SQL — only the embedding call is fixed.
 */
describe("search_across_course canary (AC-L2)", () => {
	const LESSONS = 6;
	const canary = (i: number) => `CANARY-${i}-${"x".repeat(4)}`;
	let courseId: string;
	let studentId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		studentId = (await makeUser()).id;
		courseId = (await makeCourse({ instructorId: instructor.id })).id;
		const section = await makeSection({ courseId });
		for (let i = 1; i <= LESSONS; i++) {
			const lesson = await makeLesson({
				sectionId: section.id,
				order: i,
				title: `Lesson ${i}`,
			});
			await embeddingRepository.replaceLessonChunks(
				lesson.id,
				[{ content: `Fact for lesson ${i}: ${canary(i)}`, index: 0 }],
				[VECTOR],
			);
			if (i === 1) await makeOpenedLesson({ studentId, lessonId: lesson.id });
		}
	});

	it("returns lesson 1's canary and none of lessons 2–6", async () => {
		const out = await buildSearchAcrossCourseTool(courseId, studentId).invoke({
			query: "Summarise lessons 4 to 10",
			k: 8,
		});

		expect(out).toContain(canary(1));
		for (let i = 2; i <= LESSONS; i++) expect(out).not.toContain(canary(i));
	});
});
