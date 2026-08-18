import { afterEach, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeLessonInsights,
	makeSection,
	makeUser,
} from "@/test/factories";
import { StoredConceptSchema } from "./lessonInsights.conceptsSchema";

const seed = async () => {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({ sectionId: section.id });
	return { course, lesson };
};

const storeConcepts = async (lessonId: string, concepts: unknown) => {
	await makeLessonInsights({ lessonId });
	await testDb.lessonInsights.update({
		where: { lessonId },
		data: { concepts: concepts as never },
	});
};

afterEach(() => truncateAll());

describe("the read boundary parses once, for both paths (AC 65, 66, 32)", () => {
	it("returns concepts: [] on a malformed row instead of throwing", async () => {
		const { lesson } = await seed();
		await storeConcepts(lesson.id, "not-an-array");

		const row = await lessonInsightsRepository.findByLessonId(lesson.id);

		expect(row?.concepts).toEqual([]);
	});

	it("parses the stored ARRAY shape with no cardinality bound (AC 66)", async () => {
		const { lesson } = await seed();
		const nine = Array.from({ length: 9 }, (_, i) => ({
			name: `concept ${i}`,
			explanation: "why it matters",
		}));
		await storeConcepts(lesson.id, nine);

		const row = await lessonInsightsRepository.findByLessonId(lesson.id);

		expect(row?.concepts).toHaveLength(9);
	});

	it("accepts two concepts as readily as nine — generation rules do not gate reads", async () => {
		const { lesson } = await seed();
		await storeConcepts(lesson.id, [{ name: "one" }, { name: "two" }]);

		const row = await lessonInsightsRepository.findByLessonId(lesson.id);

		expect(row?.concepts).toHaveLength(2);
	});

	it("drops non-conforming ELEMENTS on the second read path", async () => {
		const { course, lesson } = await seed();
		await storeConcepts(lesson.id, [{ notName: 1 }]);

		const rows = await lessonRepository.listOrderedWithConcepts(course.id);

		// An Array.isArray guard would yield [undefined] here.
		expect(rows.find((r) => r.id === lesson.id)?.concepts).toEqual([]);
	});

	it("keeps the conforming elements beside a bad one", async () => {
		const { course, lesson } = await seed();
		await storeConcepts(lesson.id, [{ name: "kept" }, { notName: 1 }]);

		const rows = await lessonRepository.listOrderedWithConcepts(course.id);

		expect(rows.find((r) => r.id === lesson.id)?.concepts).toEqual(["kept"]);
	});

	it("keeps the per-element length bound at read", () => {
		expect(
			StoredConceptSchema.safeParse({ name: "a".repeat(201) }).success,
		).toBe(false);
		expect(
			StoredConceptSchema.safeParse({ name: "a".repeat(200) }).success,
		).toBe(true);
	});
});

describe("consumers degrade rather than error (AC 67, 68, 69)", () => {
	/**
	 * Three consumers used to call `.map`/`.filter` straight onto the column:
	 * lessonAI's allowlist, lesson.repository's course listing and, transitively,
	 * quiz.service's mastery promotion. Each one threw a TypeError on a row
	 * holding a string. The boundary now hands every consumer an array, whatever
	 * is stored — and the repository's return TYPE says so, so a consumer cannot
	 * go back to reading raw JSON without the compiler objecting.
	 */
	it.each([
		["a string", "not-an-array"],
		["a number", 42],
		["an object", { concepts: [{ name: "wrapped wrongly" }] }],
		["null-ish content", null],
		["elements of the wrong shape", [{ notName: 1 }, "x", 7]],
	])("hands consumers an array when the row holds %s", async (_label, stored) => {
		const { course, lesson } = await seed();
		await storeConcepts(lesson.id, stored);

		const row = await lessonInsightsRepository.findByLessonId(lesson.id);
		const listed = await lessonRepository.listOrderedWithConcepts(course.id);

		expect(Array.isArray(row?.concepts)).toBe(true);
		expect(row?.concepts).toEqual([]);
		expect(listed.find((r) => r.id === lesson.id)?.concepts).toEqual([]);
	});

	it("an empty allowlist is the fail-closed direction, not a permissive one", async () => {
		const { lesson } = await seed();
		await storeConcepts(lesson.id, "not-an-array");

		const row = await lessonInsightsRepository.findByLessonId(lesson.id);

		// The tutor builds its mastery-write allowlist from this list; empty means
		// toolPolicy denies every write rather than allowing any.
		expect(row?.concepts).toHaveLength(0);
	});
});
