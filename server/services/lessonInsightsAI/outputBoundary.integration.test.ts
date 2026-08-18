import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
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

vi.mock("@/server/services/lessonInsightsAI/chains/parallel.chain", () => ({
	insightsChain: { invoke: mockInvoke },
}));

const { lessonInsightsAIService } = await import("./lessonInsightsAI.service");

const CONTENT = "A lesson about recursion, base cases and the call stack.";

const seed = async () => {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({ sectionId: section.id, content: CONTENT });
	return { instructor, lesson };
};

const generated = (summary: string) => ({
	summary: { summary },
	concepts: { concepts: [{ name: "recursion", explanation: "calls itself" }] },
	glossary: { glossary: [{ term: "base case", definition: "stops it" }] },
});

const boundaryEvents = () =>
	mockLogSecurityEvent.mock.calls.filter(
		([e]) => (e as { outcome: string }).outcome === "output_validation_failed",
	);

beforeEach(() => {
	mockInvoke.mockReset();
	mockLogSecurityEvent.mockReset();
});

afterEach(() => truncateAll());

describe("lessonInsightsAI's output boundary, report-only (AC 24, D-M)", () => {
	it("emits an event when a generated field echoes the wrapper tag", async () => {
		const { instructor, lesson } = await seed();
		mockInvoke.mockResolvedValue(
			generated('The lesson used <untrusted_data source="lesson_content">.'),
		);

		await lessonInsightsAIService.generateForLesson(lesson.id, instructor.id);

		expect(boundaryEvents()).toHaveLength(1);
		expect(boundaryEvents()[0]?.[0]).toMatchObject({
			feature: "lessonInsightsAI",
			subject: { kind: "lesson", id: lesson.id },
			ruleIds: ["untrusted_data_echo"],
		});
	});

	it("still persists the generation — report-only does not block (D-M)", async () => {
		const { instructor, lesson } = await seed();
		mockInvoke.mockResolvedValue(
			generated("The lesson used <untrusted_data>."),
		);

		const result = await lessonInsightsAIService.generateForLesson(
			lesson.id,
			instructor.id,
		);

		expect(result.summary).toContain("<untrusted_data>");
		expect(
			await testDb.lessonInsights.count({ where: { lessonId: lesson.id } }),
		).toBe(1);
	});

	it("emits nothing for a clean generation", async () => {
		const { instructor, lesson } = await seed();
		mockInvoke.mockResolvedValue(
			generated(
				"Recursion solves a problem by calling itself on smaller input.",
			),
		);

		await lessonInsightsAIService.generateForLesson(lesson.id, instructor.id);

		expect(boundaryEvents()).toEqual([]);
	});

	it("emits once per generation, not once per offending field", async () => {
		const { instructor, lesson } = await seed();
		mockInvoke.mockResolvedValue({
			summary: { summary: "<untrusted_data> one" },
			concepts: {
				concepts: [{ name: "<untrusted_data>", explanation: "two" }],
			},
			glossary: {
				glossary: [{ term: "<untrusted_data>", definition: "three" }],
			},
		});

		await lessonInsightsAIService.generateForLesson(lesson.id, instructor.id);

		expect(boundaryEvents()).toHaveLength(1);
	});

	it("carries no generated text into the event", async () => {
		const { instructor, lesson } = await seed();
		mockInvoke.mockResolvedValue(
			generated("<untrusted_data> secret-marker-text"),
		);

		await lessonInsightsAIService.generateForLesson(lesson.id, instructor.id);

		expect(JSON.stringify(boundaryEvents()[0]?.[0])).not.toContain(
			"secret-marker-text",
		);
	});

	it("does not run the boundary when the cached row is served", async () => {
		const { instructor, lesson } = await seed();
		const contentHash = createHash("sha256").update(CONTENT).digest("hex");
		await testDb.lessonInsights.create({
			data: {
				lessonId: lesson.id,
				summary: "cached",
				concepts: [{ name: "recursion" }] as never,
				glossary: [],
				model: "gpt-4o-mini",
				contentHash,
			},
		});

		await lessonInsightsAIService.generateForLesson(lesson.id, instructor.id);

		expect(mockInvoke).not.toHaveBeenCalled();
		expect(boundaryEvents()).toEqual([]);
	});
});
