import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import {
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";
import { lessonRepository } from "./lesson.repository";

describe("lessonRepository.findOrderedLessonIdsByCourseIds (integration)", () => {
	it("returns non-deleted lessons ordered by section.order then lesson.order", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({ instructorId: instructor.id });

		const sectionTwo = await makeSection({
			courseId: course.id,
			order: 1,
			title: "Two",
		});
		const sectionOne = await makeSection({
			courseId: course.id,
			order: 0,
			title: "One",
		});

		const s1l1 = await makeLesson({
			sectionId: sectionOne.id,
			order: 0,
			title: "S1L1",
		});
		const s1l2 = await makeLesson({
			sectionId: sectionOne.id,
			order: 1,
			title: "S1L2",
		});
		const s2l1 = await makeLesson({
			sectionId: sectionTwo.id,
			order: 0,
			title: "S2L1",
		});
		await makeLesson({
			sectionId: sectionTwo.id,
			order: 1,
			title: "Deleted",
			deletedAt: new Date(),
		});

		const rows = await lessonRepository.findOrderedLessonIdsByCourseIds([
			course.id,
		]);
		expect(rows.map((r) => r.lessonId)).toEqual([s1l1.id, s1l2.id, s2l1.id]);
		expect(rows[0]).toEqual({
			courseId: course.id,
			lessonId: s1l1.id,
			title: "S1L1",
		});
	});

	it("returns [] for an empty course list", async () => {
		expect(await lessonRepository.findOrderedLessonIdsByCourseIds([])).toEqual(
			[],
		);
	});
});
