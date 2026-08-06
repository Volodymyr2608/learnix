import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindFirst, mockFindByLesson } = vi.hoisted(() => ({
	mockFindFirst: vi.fn(),
	mockFindByLesson: vi.fn(),
}));

vi.mock("@/server/repositories/lesson.repository", () => ({
	lessonRepository: { findFirst: mockFindFirst },
}));
vi.mock("@/server/repositories/quiz.repository", () => ({
	quizRepository: { findByLesson: mockFindByLesson },
}));

const { buildGetLessonContentTool } = await import("./getLessonContent.tool");
const { buildGetExistingQuizzesTool } = await import(
	"./getExistingQuizzes.tool"
);

/**
 * quizAI.service proves the instructor owns one lesson, then hands the agent
 * these tools. While they took `lessonId` as a model argument and queried with
 * no ownership scoping, the check and the act could land on different lessons —
 * the chat-route divergence, routed through the model instead of through Prisma.
 * The injection vector was the lesson content these very tools return.
 */
describe("quizAI tools bind their lesson id", () => {
	beforeEach(() => {
		mockFindFirst.mockReset();
		mockFindByLesson.mockReset();
	});

	it("expose no arguments to the model", () => {
		// The attack "make the model name another instructor's lesson" is not
		// blocked here — it is unspeakable, because no argument can carry an id.
		expect(
			Object.keys(buildGetLessonContentTool("lesson-1").schema.shape),
		).toEqual([]);
		expect(
			Object.keys(buildGetExistingQuizzesTool("lesson-1").schema.shape),
		).toEqual([]);
	});

	it("reads only the lesson bound at construction", async () => {
		mockFindFirst.mockResolvedValue({ title: "T", content: "C" });

		await buildGetLessonContentTool("lesson-1").invoke({});

		expect(mockFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ id: "lesson-1" }),
			}),
		);
	});

	it("wraps the lesson content as untrusted data", async () => {
		mockFindFirst.mockResolvedValue({ title: "T", content: "C" });

		const out = await buildGetLessonContentTool("lesson-1").invoke({});

		expect(out).toContain('<untrusted_data source="lesson_content">');
	});

	it("wraps existing quiz text too", async () => {
		mockFindByLesson.mockResolvedValue([{ question: "What is recursion?" }]);

		const out = await buildGetExistingQuizzesTool("lesson-1").invoke({});

		expect(out).toContain('<untrusted_data source="lesson_content">');
		expect(out).toContain("What is recursion?");
	});
});