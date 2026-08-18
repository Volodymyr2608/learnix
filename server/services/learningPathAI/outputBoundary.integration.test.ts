import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeLessonProgress,
	makeSection,
	makeUser,
} from "@/test/factories";

const { mockInvoke, mockLogSecurityEvent } = vi.hoisted(() => ({
	mockInvoke: vi.fn(),
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));

vi.mock("@langchain/openai", () => {
	class ChatOpenAI {
		withStructuredOutput() {
			return { invoke: mockInvoke };
		}
	}
	return { ChatOpenAI };
});

const { learningPathAIService } = await import("./learningPathAI.service");
const { LearningPathInvalidError } = await import("./learningPathAI.errors");

const seed = async () => {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const student = await makeUser({ role: Role.STUDENT });
	// loadStudentSignal requires a published, non-deleted course.
	const course = await makeCourse({
		instructorId: instructor.id,
		status: "published",
	});
	const section = await makeSection({ courseId: course.id });
	const done = await makeLesson({ sectionId: section.id, order: 0 });
	const next = await makeLesson({ sectionId: section.id, order: 1 });
	await makeEnrollment({ studentId: student.id, courseId: course.id });
	// A student with history: with none, setSkipLLMIfEmpty builds the path
	// deterministically from server-authored reason seeds and the model — and so
	// the boundary — never sees anything.
	await makeLessonProgress({
		studentId: student.id,
		lessonId: done.id,
		isCompleted: true,
	});
	return { student, course, lesson: next };
};

const draft = (reason: string, lessonId: string) => ({
	steps: [
		{
			type: "NEW_LESSON",
			lessonId,
			quizId: null,
			title: "Start here",
			reason,
		},
	],
	summary: "A recommendation long enough to satisfy the schema.",
	weakConcepts: [],
});

beforeEach(() => {
	mockInvoke.mockReset();
	mockLogSecurityEvent.mockReset();
});

afterEach(() => truncateAll());

describe("learningPathAI's output boundary (AC 23, 26)", () => {
	it("persists a clean path", async () => {
		const { student, course, lesson } = await seed();
		mockInvoke
			.mockResolvedValueOnce(
				draft("Because you have not started it.", lesson.id),
			)
			.mockResolvedValue({ ok: true, feedback: "" });

		await learningPathAIService.regenerate(student.id, course.id);

		expect(
			await testDb.learningPathCache.count({ where: { courseId: course.id } }),
		).toBe(1);
	});

	it("persists nothing when a model-authored reason echoes the wrapper tag", async () => {
		const { student, course, lesson } = await seed();
		mockInvoke
			.mockResolvedValueOnce(
				draft(
					'Because <untrusted_data source="lesson_content"> said so.',
					lesson.id,
				),
			)
			.mockResolvedValue({ ok: true, feedback: "" });

		await expect(
			learningPathAIService.regenerate(student.id, course.id),
		).rejects.toBeInstanceOf(LearningPathInvalidError);

		expect(
			await testDb.learningPathCache.count({ where: { courseId: course.id } }),
		).toBe(0);
	});

	it("emits one event naming the course, not the student's own text", async () => {
		const { student, course, lesson } = await seed();
		mockInvoke
			.mockResolvedValueOnce(
				draft("Because <untrusted_data> said so.", lesson.id),
			)
			.mockResolvedValue({ ok: true, feedback: "" });

		await learningPathAIService
			.regenerate(student.id, course.id)
			.catch(() => undefined);

		const events = mockLogSecurityEvent.mock.calls.filter(
			([e]) =>
				(e as { outcome: string }).outcome === "output_validation_failed",
		);
		expect(events).toHaveLength(1);
		expect(events[0]?.[0]).toMatchObject({
			feature: "learningPathAI",
			subject: { kind: "course", id: course.id },
		});
		// The rule id is legitimately named untrusted_data_echo; what must not
		// appear is the model's text itself.
		expect(JSON.stringify(events[0]?.[0])).not.toContain("said so");
		expect(JSON.stringify(events[0]?.[0])).not.toContain("Start here");
	});

	it("is not distinguishable by the caller from a semantic-validation failure (F10)", async () => {
		const { student, course, lesson } = await seed();
		mockInvoke
			.mockResolvedValueOnce(
				draft("Because <untrusted_data> said so.", lesson.id),
			)
			.mockResolvedValue({ ok: true, feedback: "" });

		const rejection = await learningPathAIService
			.regenerate(student.id, course.id)
			.catch((e) => e);

		// The class the caller sees, and the message, are the ones a failed
		// semantic validation produces. Only the event tells the two apart.
		expect(rejection).toBeInstanceOf(LearningPathInvalidError);
		expect(rejection.constructor.name).toContain("LearningPath");
	});
});
