import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lessonAssistantRepository } from "@/server/repositories/lessonAssistant.repository";
import { testDb, truncateAll } from "@/test/db";
import { findKeyPaths } from "@/test/deepKeys";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

/**
 * The answer key's confinement is a property of the shape, not of a list of
 * redactions. `toolCalls` is a durable column on the assistant row, and
 * `getHistory` is a student-reachable query — so the projection has to exclude
 * it structurally rather than rely on nothing ever being written there.
 */
describe("lesson assistant history carries no tool calls", () => {
	let lessonId: string;
	let studentId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		lessonId = lesson.id;
		studentId = student.id;

		await lessonAssistantRepository.saveMessage(lessonId, studentId, {
			role: "user",
			content: "explain the base case",
		});
		await lessonAssistantRepository.saveMessage(lessonId, studentId, {
			role: "assistant",
			content: "A base case stops the recursion.",
			toolCalls: [{ tool: "ask_concept_check" }],
		});
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	it("returns only the fields the thread UI renders", async () => {
		const rows = await lessonAssistantRepository.getMessages(
			lessonId,
			studentId,
		);

		expect(rows).toHaveLength(2);
		for (const row of rows) {
			// Key absence, not `undefined`: a select that still loads the column
			// and happens to hold null would pass a value assertion.
			expect("toolCalls" in row).toBe(false);
			expect(Object.keys(row).sort()).toEqual([
				"content",
				"createdAt",
				"id",
				"role",
			]);
		}
		expect(findKeyPaths(rows, "toolCalls")).toEqual([]);
	});

	it("keeps the column populated — the projection is what withholds it", async () => {
		// Discriminating: if nothing were ever written to toolCalls, the test
		// above would pass against a projection that does not exist.
		const stored = await testDb.lessonAssistantMessage.findFirst({
			where: { role: "assistant" },
		});

		expect(stored?.toolCalls).not.toBeNull();
	});

	it("replays history to the model as content only", async () => {
		const context = await lessonAssistantRepository.getContextMessages(
			lessonId,
			studentId,
		);

		expect(findKeyPaths(context, "toolCalls")).toEqual([]);
		for (const row of context) {
			expect(JSON.stringify(row)).not.toContain("ask_concept_check");
		}
	});
});
