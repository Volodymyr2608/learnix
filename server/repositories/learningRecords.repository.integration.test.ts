import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeConceptCheck,
	makeConceptMastery,
	makeCourse,
	makeEnrollment,
	makeLearningPathCache,
	makeLesson,
	makeLessonAssistantConversation,
	makeLessonProgress,
	makeOpenedLesson,
	makeQuiz,
	makeQuizAttempt,
	makeSection,
	makeUser,
} from "@/test/factories";
import { learningRecordsRepository } from "./learningRecords.repository";

const DAY1 = new Date("2026-11-18T09:00:00.000Z");
const DAY2 = new Date("2026-11-19T21:30:00.000Z");
const midnight = (d: Date) =>
	new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

describe("learningRecordsRepository.clearForRefund (FR-P9, AI-L13)", () => {
	let studentId: string;
	let courseA: { id: string; lessons: string[] };
	let courseB: { id: string; lessons: string[] };

	const seedCourse = async (instructorId: string, minutes: number[]) => {
		const course = await makeCourse({ instructorId });
		const section = await makeSection({ courseId: course.id });
		const lessons = await Promise.all(
			minutes.map((m, i) =>
				makeLesson({ sectionId: section.id, order: i + 1, durationMinutes: m }),
			),
		);
		return { id: course.id, lessons: lessons.map((l) => l.id) };
	};

	const clear = () =>
		testDb.$transaction((tx) =>
			learningRecordsRepository.clearForRefund(tx, studentId, courseA.id),
		);

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		studentId = (await makeUser()).id;
		courseA = await seedCourse(instructor.id, [10, 20, 30]);
		courseB = await seedCourse(instructor.id, [15]);
		for (const c of [courseA, courseB]) {
			await makeEnrollment({ studentId, courseId: c.id, progress: 60 });
			const lessonId = c.lessons[0] ?? "";
			await makeOpenedLesson({ studentId, lessonId });
			const quiz = await makeQuiz({ lessonId });
			await makeQuizAttempt({ quizId: quiz.id, studentId });
			await makeLessonAssistantConversation({ lessonId, studentId });
			await makeConceptCheck({ studentId, lessonId, courseId: c.id });
			await makeLearningPathCache({ studentId, courseId: c.id });
			await makeConceptMastery({
				studentId,
				courseId: c.id,
				concept: "Recursion",
			});
		}
		const [a1, a2, a3] = courseA.lessons;
		await makeLessonProgress({
			lessonId: a1 ?? "",
			studentId,
			isCompleted: true,
			completedAt: DAY1,
		});
		await makeLessonProgress({
			lessonId: a2 ?? "",
			studentId,
			isCompleted: true,
			completedAt: DAY1,
		});
		await makeLessonProgress({
			lessonId: a3 ?? "",
			studentId,
			isCompleted: true,
			completedAt: DAY2,
		});
		await makeLessonProgress({
			lessonId: courseB.lessons[0] ?? "",
			studentId,
			isCompleted: true,
			completedAt: DAY1,
		});
	});

	it("deletes every learning record of the refunded course and keeps the other course's", async () => {
		await clear();

		const count = async (courseId: string) => ({
			progress: await testDb.lessonProgress.count({
				where: { studentId, lesson: { section: { courseId } } },
			}),
			opened: await testDb.openedLesson.count({
				where: { studentId, lesson: { section: { courseId } } },
			}),
			attempts: await testDb.quizAttempt.count({
				where: { studentId, quiz: { lesson: { section: { courseId } } } },
			}),
			tutor: await testDb.lessonAssistantConversation.count({
				where: { studentId, lesson: { section: { courseId } } },
			}),
			checks: await testDb.conceptCheck.count({
				where: { studentId, courseId },
			}),
			path: await testDb.learningPathCache.count({
				where: { studentId, courseId },
			}),
			mastery: await testDb.conceptMastery.count({
				where: { studentId, courseId },
			}),
		});
		expect(await count(courseA.id)).toEqual({
			progress: 0,
			opened: 0,
			attempts: 0,
			tutor: 0,
			checks: 0,
			path: 0,
			mastery: 1,
		});
		expect(await count(courseB.id)).toEqual({
			progress: 1,
			opened: 1,
			attempts: 1,
			tutor: 1,
			checks: 1,
			path: 1,
			mastery: 1,
		});
		expect(await testDb.lessonAssistantMessage.count()).toBe(1);
		const enrollmentA = await testDb.enrollment.findFirstOrThrow({
			where: { studentId, courseId: courseA.id },
		});
		expect(enrollmentA.progress).toBe(0);
	});

	it("archives the refunded course's minutes and lessons per UTC day first", async () => {
		await clear();

		const rows = await testDb.studyArchive.findMany({
			where: { studentId },
			orderBy: { day: "asc" },
		});
		expect(rows).toEqual([
			{ studentId, day: midnight(DAY1), minutes: 30, lessons: 2 },
			{ studentId, day: midnight(DAY2), minutes: 30, lessons: 1 },
		]);
	});

	it("adds to an existing archive day on a second refund", async () => {
		await testDb.studyArchive.create({
			data: { studentId, day: midnight(DAY1), minutes: 5, lessons: 1 },
		});

		await clear();

		const day1 = await testDb.studyArchive.findUniqueOrThrow({
			where: { studentId_day: { studentId, day: midnight(DAY1) } },
		});
		expect(day1).toMatchObject({ minutes: 35, lessons: 3 });
	});

	it("also clears records of a soft-deleted lesson", async () => {
		await testDb.lesson.update({
			where: { id: courseA.lessons[2] },
			data: { deletedAt: new Date() },
		});

		await clear();

		expect(
			await testDb.lessonProgress.count({
				where: { lessonId: courseA.lessons[2] },
			}),
		).toBe(0);
	});
});
