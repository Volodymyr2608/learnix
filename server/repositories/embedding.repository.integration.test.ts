import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeOpenedLesson,
	makeSection,
	makeUser,
} from "@/test/factories";
import { embeddingRepository } from "./embedding.repository";

const VECTOR = new Array(1536).fill(0.1) as number[];

describe("embeddingRepository lesson-chunk scoping", () => {
	let lessonId: string;

	beforeEach(async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		lessonId = lesson.id;

		await embeddingRepository.replaceLessonChunks(
			lessonId,
			[{ content: "Recursion ends at a base case.", index: 0 }],
			[VECTOR],
		);
	});

	it("finds chunks for a live lesson", async () => {
		const rows = await embeddingRepository.searchLessonChunks(
			lessonId,
			VECTOR,
			4,
		);

		expect(rows.map((r) => r.content)).toEqual([
			"Recursion ends at a base case.",
		]);
	});

	// searchCourseChunks already filters deleted_at; this one did not, and was
	// safe only because the lesson route happened to check deletedAt first —
	// a property of the caller, not an invariant of the query.
	it("returns nothing for a soft-deleted lesson", async () => {
		await testDb.lesson.update({
			where: { id: lessonId },
			data: { deletedAt: new Date() },
		});

		const rows = await embeddingRepository.searchLessonChunks(
			lessonId,
			VECTOR,
			4,
		);

		expect(rows).toEqual([]);
	});
});

describe("embeddingRepository.searchCourseChunks — opened lessons only (AI-C2, AC-L2)", () => {
	let courseId: string;
	let studentId: string;
	let otherId: string;
	let opened: string;
	let unopened: string;

	beforeEach(async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		studentId = (await makeUser()).id;
		otherId = (await makeUser()).id;
		courseId = (await makeCourse({ instructorId: instructor.id })).id;
		const section = await makeSection({ courseId });
		opened = (await makeLesson({ sectionId: section.id, order: 1, title: "A" }))
			.id;
		unopened = (
			await makeLesson({ sectionId: section.id, order: 2, title: "B" })
		).id;
		await embeddingRepository.replaceLessonChunks(
			opened,
			[{ content: "From A.", index: 0 }],
			[VECTOR],
		);
		await embeddingRepository.replaceLessonChunks(
			unopened,
			[{ content: "From B.", index: 0 }],
			[VECTOR],
		);
		await makeOpenedLesson({ studentId, lessonId: opened });
		await makeOpenedLesson({ studentId: otherId, lessonId: unopened });
	});

	it("returns chunks of the lessons this student opened, none of the others", async () => {
		const rows = await embeddingRepository.searchCourseChunks(
			courseId,
			studentId,
			VECTOR,
			8,
		);

		expect(rows.map((r) => r.content)).toEqual(["From A."]);
	});

	it("does not count another student's opens", async () => {
		const rows = await embeddingRepository.searchCourseChunks(
			courseId,
			otherId,
			VECTOR,
			8,
		);

		expect(rows.map((r) => r.content)).toEqual(["From B."]);
	});
});
