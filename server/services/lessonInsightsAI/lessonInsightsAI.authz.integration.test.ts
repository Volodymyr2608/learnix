import { afterEach, describe, expect, it } from "vitest";
import { EnrollmentStatus, Role } from "@/generated/prisma";
import { truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeLessonInsights,
	makeSection,
	makeUser,
} from "@/test/factories";
import { lessonInsightsAIService } from "./lessonInsightsAI.service";

/**
 * `getForLesson` is the only read path for a study guide, and both views call it
 * — so it is the single place where "who may see this lesson's guide" is
 * decided. Nothing in the study-guide UI work touched that query, which is
 * exactly why it is tested: a don't-break control with no test is
 * indistinguishable from an absent one (ADR-017 Rule 2, spec.md AC 11).
 */
const seed = async () => {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({ sectionId: section.id });
	await makeLessonInsights({ lessonId: lesson.id });

	return { instructor, course, lesson };
};

afterEach(() => truncateAll());

describe("getForLesson is instructor-or-enrolled (AC 11)", () => {
	it("returns the guide to the course's own instructor", async () => {
		const { instructor, lesson } = await seed();

		const row = await lessonInsightsAIService.getForLesson(
			lesson.id,
			instructor.id,
		);

		expect(row?.lessonId).toBe(lesson.id);
	});

	it("returns the guide to a student with an active enrollment", async () => {
		const { course, lesson } = await seed();
		const student = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ courseId: course.id, studentId: student.id });

		const row = await lessonInsightsAIService.getForLesson(
			lesson.id,
			student.id,
		);

		expect(row?.lessonId).toBe(lesson.id);
	});

	it("denies a different instructor", async () => {
		const { lesson } = await seed();
		const other = await makeUser({ role: Role.INSTRUCTOR });

		expect(
			await lessonInsightsAIService.getForLesson(lesson.id, other.id),
		).toBe(null);
	});

	it("denies a student with no enrollment", async () => {
		const { lesson } = await seed();
		const stranger = await makeUser({ role: Role.STUDENT });

		expect(
			await lessonInsightsAIService.getForLesson(lesson.id, stranger.id),
		).toBe(null);
	});

	it("denies a student whose enrollment was cancelled", async () => {
		const { course, lesson } = await seed();
		const student = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({
			courseId: course.id,
			status: EnrollmentStatus.cancelled,
			studentId: student.id,
		});

		expect(
			await lessonInsightsAIService.getForLesson(lesson.id, student.id),
		).toBe(null);
	});
});
