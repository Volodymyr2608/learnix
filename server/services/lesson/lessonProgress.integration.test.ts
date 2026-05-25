import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnrollmentStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: {
		embedLessonChunks: vi.fn().mockResolvedValue(undefined),
		recomputeUserInterest: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("@/server/services/notifications/notification.service", () => ({
	notificationService: {
		fireCertificateEarned: vi.fn().mockResolvedValue(undefined),
		fireProgressNearCompletion: vi.fn().mockResolvedValue(undefined),
	},
}));

const { lessonService } = await import("./lesson.service");

async function seedLesson() {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const student = await makeUser({ role: Role.STUDENT });
	const course = await makeCourse({
		instructorId: instructor.id,
		status: "published",
	});
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({ sectionId: section.id });

	// markLessonComplete requires an active enrollment
	await testDb.enrollment.create({
		data: {
			studentId: student.id,
			courseId: course.id,
			status: EnrollmentStatus.active,
		},
	});

	return { student, lesson };
}

describe("LessonService progress", () => {
	beforeEach(() => vi.clearAllMocks());

	it("marks a lesson complete (idempotent)", async () => {
		const { student, lesson } = await seedLesson();

		await lessonService.markLessonComplete(lesson.id, student.id);
		await lessonService.markLessonComplete(lesson.id, student.id);

		const rows = await testDb.lessonProgress.findMany({
			where: { lessonId: lesson.id, studentId: student.id },
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.isCompleted).toBe(true);
		expect(rows[0]?.completedAt).not.toBeNull();
	});

	it("marks a previously completed lesson incomplete", async () => {
		const { student, lesson } = await seedLesson();
		await lessonService.markLessonComplete(lesson.id, student.id);

		await lessonService.markLessonIncomplete(lesson.id, student.id);

		const row = await testDb.lessonProgress.findFirst({
			where: { lessonId: lesson.id, studentId: student.id },
		});
		expect(row?.isCompleted).toBe(false);
		expect(row?.completedAt).toBeNull();
	});
});
