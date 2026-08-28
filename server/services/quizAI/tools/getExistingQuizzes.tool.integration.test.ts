import { beforeEach, describe, expect, it } from "vitest";
import { buildGetExistingQuizzesTool } from "@/server/services/quizAI/tools/getExistingQuizzes.tool";
import {
	makeCourse,
	makeLesson,
	makeQuiz,
	makeSection,
	makeUser,
} from "@/test/factories";

/**
 * An integration test rather than a unit one on purpose: what keeps the key out
 * of this tool's output is the repository projection, so a mocked repository
 * would assert only that the fixture it was handed contained no key.
 */
describe("get_existing_quizzes returns questions and nothing else", () => {
	let lessonId: string;

	beforeEach(async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		lessonId = lesson.id;
	});

	it("never emits the answer, even as a distinctive sentinel", async () => {
		await makeQuiz({
			lessonId,
			question: "What is a base case?",
			options: ["ALPHA", "BETA", "GAMMA", "DELTA"],
			correct: "GAMMA-SENTINEL",
		});
		const tool = buildGetExistingQuizzesTool(lessonId);

		const output = await tool.invoke({});

		expect(output).toContain("What is a base case?");
		expect(output).not.toContain("GAMMA-SENTINEL");
		// The option set is withheld too: handed to a model that also reads the
		// lesson, it is most of the way to reconstructing the key.
		expect(output).not.toContain("ALPHA");
	});

	it("says so plainly when the lesson has no questions yet", async () => {
		const tool = buildGetExistingQuizzesTool(lessonId);

		const output = await tool.invoke({});

		expect(output).toBe("No existing questions for this lesson.");
	});

	it("leaves a deleted question out", async () => {
		await makeQuiz({ lessonId, question: "live question" });
		await makeQuiz({
			lessonId,
			question: "deleted question",
			deletedAt: new Date(),
		});
		const tool = buildGetExistingQuizzesTool(lessonId);

		const output = await tool.invoke({});

		expect(output).toContain("live question");
		expect(output).not.toContain("deleted question");
	});
});
