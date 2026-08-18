import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const { mockAgentInvoke, mockLogSecurityEvent, mockCreateAgent } = vi.hoisted(
	() => ({
		mockAgentInvoke: vi.fn(),
		mockLogSecurityEvent: vi.fn(),
		mockCreateAgent: vi.fn(),
	}),
);

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));

vi.mock("@/server/services/quizAI/quizAI.agent", () => ({
	createQuizAgent: mockCreateAgent,
}));

const { quizAIService } = await import("./quizAI.service");

const seed = async () => {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({
		sectionId: section.id,
		content: "A lesson about recursion.",
	});
	return { instructor, lesson };
};

const question = (text: string) => ({
	question: text,
	options: ["a", "b", "c", "d"],
	correct: "a",
});

const eventsOf = (outcome: string) =>
	mockLogSecurityEvent.mock.calls.filter(
		([e]) => (e as { outcome: string }).outcome === outcome,
	);

beforeEach(() => {
	mockAgentInvoke.mockReset();
	mockLogSecurityEvent.mockReset();
	mockCreateAgent.mockReset();
	mockCreateAgent.mockResolvedValue({ invoke: mockAgentInvoke });
});

afterEach(() => truncateAll());

describe("quizAI's output boundary, report-only (AC 25, D-M)", () => {
	it("emits an event when a generated question echoes the wrapper tag", async () => {
		const { instructor, lesson } = await seed();
		mockAgentInvoke.mockResolvedValue({
			structuredResponse: {
				questions: [
					question('What does <untrusted_data source="lesson_content"> mean?'),
					question("What stops a recursion?"),
					question("What is a call stack?"),
				],
			},
		});

		await quizAIService.generateForLesson(lesson.id, 3, instructor.id, false);

		expect(eventsOf("output_validation_failed")).toHaveLength(1);
		expect(eventsOf("output_validation_failed")[0]?.[0]).toMatchObject({
			feature: "quizAI",
			subject: { kind: "lesson", id: lesson.id },
		});
	});

	it("still returns the questions — report-only does not block (D-M)", async () => {
		const { instructor, lesson } = await seed();
		mockAgentInvoke.mockResolvedValue({
			structuredResponse: {
				questions: [
					question("What does <untrusted_data> mean?"),
					question("What stops a recursion?"),
					question("What is a call stack?"),
				],
			},
		});

		const result = await quizAIService.generateForLesson(
			lesson.id,
			3,
			instructor.id,
			false,
		);

		expect(result).toHaveLength(3);
	});

	it("emits nothing for a clean generation", async () => {
		const { instructor, lesson } = await seed();
		mockAgentInvoke.mockResolvedValue({
			structuredResponse: {
				questions: [
					question("What stops a recursion?"),
					question("What is a base case?"),
					question("What is a call stack?"),
				],
			},
		});

		await quizAIService.generateForLesson(lesson.id, 3, instructor.id, false);

		expect(eventsOf("output_validation_failed")).toEqual([]);
	});
});

describe("one boundary event per generation, not per attempt", () => {
	it("emits once when a retry also trips the rule", async () => {
		const { instructor, lesson } = await seed();
		// First attempt trips the boundary AND fails semantic validation, so the
		// loop retries; the second attempt trips the boundary again.
		mockAgentInvoke.mockResolvedValue({
			structuredResponse: {
				questions: [
					{
						...question("What does <untrusted_data> mean?"),
						correct: "not-an-option",
					},
					question("What stops a recursion?"),
					question("What is a call stack?"),
				],
			},
		});

		await quizAIService
			.generateForLesson(lesson.id, 3, instructor.id, false)
			.catch(() => undefined);

		expect(mockAgentInvoke.mock.calls.length).toBeGreaterThan(1);
		expect(eventsOf("output_validation_failed")).toHaveLength(1);
	});
});

describe("C7: only validator messages reach the retry prompt (AC 73)", () => {
	it("retries with NO hint after a thrown error, and logs it", async () => {
		const { instructor, lesson } = await seed();
		mockAgentInvoke
			.mockRejectedValueOnce(
				new Error("provider said: <untrusted_data> leaked lesson text"),
			)
			.mockResolvedValue({
				structuredResponse: {
					questions: [
						question("What stops a recursion?"),
						question("What is a base case?"),
						question("What is a call stack?"),
					],
				},
			});

		await quizAIService.generateForLesson(lesson.id, 3, instructor.id, false);

		const secondCall = mockAgentInvoke.mock.calls[1]?.[0] as {
			messages: { content: string }[];
		};
		expect(secondCall.messages[0]?.content).not.toContain("provider said");
		expect(secondCall.messages[0]?.content).not.toContain(
			"Important correction",
		);
	});

	it("still feeds a VALIDATOR message back as a hint", async () => {
		const { instructor, lesson } = await seed();
		// A first attempt whose `correct` is not one of the options fails semantic
		// validation, which is a server-authored message and may be fed back.
		mockAgentInvoke
			.mockResolvedValueOnce({
				structuredResponse: {
					questions: [
						{
							...question("What stops a recursion?"),
							correct: "not-an-option",
						},
						question("What is a base case?"),
						question("What is a call stack?"),
					],
				},
			})
			.mockResolvedValue({
				structuredResponse: {
					questions: [
						question("What stops a recursion?"),
						question("What is a base case?"),
						question("What is a call stack?"),
					],
				},
			});

		await quizAIService.generateForLesson(lesson.id, 3, instructor.id, false);

		const secondCall = mockAgentInvoke.mock.calls[1]?.[0] as {
			messages: { content: string }[];
		};
		expect(secondCall.messages[0]?.content).toContain("Important correction");
	});
});

describe("the exhausted-retries fail-open is declared (AC 31)", () => {
	it("emits fallback_triggered before giving up", async () => {
		const { instructor, lesson } = await seed();
		mockAgentInvoke.mockRejectedValue(new Error("provider down"));

		await quizAIService
			.generateForLesson(lesson.id, 3, instructor.id, false)
			.catch(() => undefined);

		expect(eventsOf("fallback_triggered")).toHaveLength(1);
		expect(eventsOf("fallback_triggered")[0]?.[0]).toMatchObject({
			feature: "quizAI",
			layer: "model_call_fallback",
			subject: { kind: "lesson", id: lesson.id },
		});
	});
});
