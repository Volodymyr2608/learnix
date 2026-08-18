import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

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

const generated = {
	summary: { summary: "A summary of the lesson." },
	concepts: { concepts: [{ name: "recursion", explanation: "calls itself" }] },
	glossary: { glossary: [] },
};

afterEach(async () => {
	mockInvoke.mockReset();
	await truncateAll();
});

describe("a parse failure is a cache miss (AC 67)", () => {
	it("regenerates when the stored concepts are malformed, healing the row", async () => {
		const { instructor, lesson } = await seed();
		const contentHash = createHash("sha256").update(CONTENT).digest("hex");

		// A row whose hash matches but whose concepts do not survive the read
		// boundary: without the shape condition this short-circuits forever.
		await testDb.lessonInsights.create({
			data: {
				lessonId: lesson.id,
				summary: "stale",
				concepts: "not-an-array" as never,
				glossary: [],
				model: "gpt-4o-mini",
				contentHash,
			},
		});
		mockInvoke.mockResolvedValue(generated);

		const result = await lessonInsightsAIService.generateForLesson(
			lesson.id,
			instructor.id,
		);

		expect(mockInvoke).toHaveBeenCalledTimes(1);
		expect(result.concepts).toEqual([
			{ name: "recursion", explanation: "calls itself" },
		]);
	});

	it("still serves a healthy cached row without calling the model", async () => {
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

		const result = await lessonInsightsAIService.generateForLesson(
			lesson.id,
			instructor.id,
		);

		expect(mockInvoke).not.toHaveBeenCalled();
		expect(result.summary).toBe("cached");
	});
});
