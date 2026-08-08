import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";

const { mockUpsertMastery } = vi.hoisted(() => ({
	mockUpsertMastery: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/server/repositories/conceptMastery.repository", () => ({
	conceptMasteryRepository: { upsertMastery: mockUpsertMastery },
}));
vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: vi.fn(),
}));

const { buildMarkConceptUnderstoodTool } = await import(
	"./markConceptUnderstood.tool"
);

const build = (lessonConcepts: string[]) =>
	buildMarkConceptUnderstoodTool("student-1", "course-1", lessonConcepts);

describe("mark_concept_understood", () => {
	beforeEach(() => mockUpsertMastery.mockClear());

	it("writes nothing and returns the neutral refusal for an off-allowlist concept", async () => {
		const tool = build(["Recursion"]);

		const result = await tool.invoke({
			concept: "Course completed in full",
			level: 2,
		});

		expect(mockUpsertMastery).not.toHaveBeenCalled();
		expect(result).toBe(NEUTRAL_REFUSAL_MESSAGE);
	});

	it("writes nothing when the lesson has no extracted concepts", async () => {
		const tool = build([]);

		await tool.invoke({ concept: "Recursion", level: 1 });

		expect(mockUpsertMastery).not.toHaveBeenCalled();
	});

	it("refuses level 3 from conversation but allows level 2", async () => {
		const tool = build(["Recursion"]);

		await tool.invoke({ concept: "Recursion", level: 3 });
		expect(mockUpsertMastery).not.toHaveBeenCalled();

		await tool.invoke({ concept: "Recursion", level: 2 });
		expect(mockUpsertMastery).toHaveBeenCalledWith(
			"student-1",
			"course-1",
			"Recursion",
			2,
		);
	});

	it("stores the canonical spelling, not the model's", async () => {
		const tool = build(["Base Case"]);

		await tool.invoke({ concept: "  base case ", level: 1 });

		expect(mockUpsertMastery).toHaveBeenCalledWith(
			"student-1",
			"course-1",
			"Base Case",
			1,
		);
	});
});
