import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb, truncateAll } from "@/test/db";
import {
	makeConceptCheck,
	makeCourse,
	makeEnrollment,
	makeLearningPathCache,
	makeLesson,
	makeLessonAssistantConversation,
	makeSection,
	makeUser,
} from "@/test/factories";

const callerFor = (id: string) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role: Role.STUDENT }, session: { id: "s1" } },
	} as never);

describe("AI history after a refund (LLM audit Low: deletion is not the only control)", () => {
	let studentId: string;
	let courseId: string;
	let lessonId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		studentId = (await makeUser()).id;
		courseId = (
			await makeCourse({ instructorId: instructor.id, status: "published" })
		).id;
		const section = await makeSection({ courseId });
		lessonId = (await makeLesson({ sectionId: section.id })).id;
		// Rows a tutor turn or a path generation in flight wrote after the refund's deletion.
		await makeLessonAssistantConversation({ lessonId, studentId });
		await makeConceptCheck({ studentId, lessonId, courseId });
		await makeLearningPathCache({ studentId, courseId });
	});

	it("serves them while the student is enrolled", async () => {
		await makeEnrollment({ studentId, courseId });
		const caller = callerFor(studentId);

		expect(await caller.lessonAssistant.getHistory({ lessonId })).toHaveLength(
			1,
		);
		expect(
			await caller.lessonAssistant.pendingCheck({ lessonId }),
		).not.toBeNull();
		expect(await caller.learningPath.getForCourse({ courseId })).not.toBeNull();
	});

	it("serves nothing once the enrollment is cancelled", async () => {
		await makeEnrollment({ studentId, courseId, status: "cancelled" });
		const caller = callerFor(studentId);

		expect(await caller.lessonAssistant.getHistory({ lessonId })).toEqual([]);
		expect(await caller.lessonAssistant.pendingCheck({ lessonId })).toBeNull();
		expect(await caller.learningPath.getForCourse({ courseId })).toBeNull();
	});
});
