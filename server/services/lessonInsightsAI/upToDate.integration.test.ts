import { afterEach, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";
import { lessonContentHash } from "./contentHash";
import { lessonInsightsAIService } from "./lessonInsightsAI.service";

/**
 * `matchesCurrentContent` is what disables the Regenerate button, and it has to
 * agree with `generateForLesson`'s cache condition exactly. Where they disagree
 * the button lies: enabled but declining to do anything, or disabled on the one
 * state a regeneration would fix.
 */
const CONTENT = "A lesson about recursion, base cases and the call stack.";

const seed = async (content = CONTENT) => {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({ sectionId: section.id, content });
	return { instructor, lesson };
};

const storeInsights = (
	lessonId: string,
	contentHash: string,
	concepts: unknown = [{ name: "recursion", explanation: "calls itself" }],
) =>
	testDb.lessonInsights.create({
		data: {
			lessonId,
			summary: "A summary.",
			concepts: concepts as never,
			glossary: [],
			model: "gpt-4o-mini",
			contentHash,
		},
	});

afterEach(() => truncateAll());

describe("getForLesson reports whether regenerating would do anything (AC 14)", () => {
	it("is up to date when the stored hash matches the lesson text", async () => {
		const { instructor, lesson } = await seed();
		await storeInsights(lesson.id, lessonContentHash(CONTENT));

		const row = await lessonInsightsAIService.getForLesson(
			lesson.id,
			instructor.id,
		);

		expect(row?.matchesCurrentContent).toBe(true);
	});

	it("is not up to date once the lesson text has changed", async () => {
		const { instructor, lesson } = await seed();
		await storeInsights(lesson.id, lessonContentHash("something else"));

		const row = await lessonInsightsAIService.getForLesson(
			lesson.id,
			instructor.id,
		);

		expect(row?.matchesCurrentContent).toBe(false);
	});

	/**
	 * The case the naive hash check gets wrong. `generateForLesson` treats a row
	 * whose concepts do not survive the read boundary as a cache MISS and
	 * regenerates to heal it — so reporting "up to date" here would disable the
	 * only button that can fix the row, and the guide would stay broken forever.
	 */
	it("is not up to date when the hash matches but the concepts are malformed", async () => {
		const { instructor, lesson } = await seed();
		await storeInsights(lesson.id, lessonContentHash(CONTENT), "not-an-array");

		const row = await lessonInsightsAIService.getForLesson(
			lesson.id,
			instructor.id,
		);

		expect(row?.concepts).toEqual([]);
		expect(row?.matchesCurrentContent).toBe(false);
	});

	it("returns null when the lesson has no guide at all", async () => {
		const { instructor, lesson } = await seed();

		expect(
			await lessonInsightsAIService.getForLesson(lesson.id, instructor.id),
		).toBe(null);
	});
});
