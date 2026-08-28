import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authorizeMarkConceptUnderstood } from "@/server/services/lessonAI/toolPolicy";
import { canonicalConceptNames } from "@/server/services/quiz/quiz.service";
import { CONVERSATION_MAX_LEVEL, QUIZ_MASTERY_LEVEL } from "./masteryLevels";

describe("the two mastery ceilings", () => {
	// The whole argument for letting the tutor write mastery at all: what it can
	// write is strictly below what only finishing the quizzes can reach. Equal
	// values would make a conversation worth as much as a completed lesson.
	it("puts the quiz ceiling strictly above the conversation ceiling", () => {
		expect(QUIZ_MASTERY_LEVEL).toBeGreaterThan(CONVERSATION_MAX_LEVEL);
	});

	it("keeps the values the schema and the tool ceiling were written against", () => {
		expect(CONVERSATION_MAX_LEVEL).toBe(2);
		expect(QUIZ_MASTERY_LEVEL).toBe(3);
	});

	// A literal 3 in the promotion is how the ceilings drift apart: the constant
	// moves, the write does not, and nothing fails.
	it("is what the promotion writes, rather than a literal", () => {
		const source = readFileSync("server/services/quiz/quiz.service.ts", "utf8");

		expect(source).toContain("QUIZ_MASTERY_LEVEL");
		expect(source).not.toMatch(/upsertMastery\([^)]*\b3\b/s);
	});

	it("is what the tool policy enforces, rather than its own copy", () => {
		const source = readFileSync(
			"server/services/lessonAI/toolPolicy.ts",
			"utf8",
		);

		expect(source).toContain('from "@/server/services/mastery/masteryLevels"');
		expect(source).not.toMatch(/CONVERSATION_MAX_LEVEL\s*=\s*\d/);
	});

	// ConceptMastery is unique on the exact string, so two writers that disagree
	// about whitespace put one concept in the table twice — and the learning path
	// then recommends reviewing what the student has demonstrably mastered. The
	// allowlist is model-authored insights JSON, which is where the padding comes
	// from.
	it("stores the same string from either writer for the same concept", () => {
		const stored = [{ name: "  Recursion " }];

		const fromQuiz = canonicalConceptNames(stored);
		const fromTool = authorizeMarkConceptUnderstood(
			{ concept: "recursion", level: 2 },
			{ userId: "u1", lessonConcepts: stored.map((c) => c.name) },
		);

		expect(fromTool.authorized).toBe(true);
		expect(fromTool.authorized && fromTool.canonicalConcept).toBe(fromQuiz[0]);
		expect(fromQuiz).toEqual(["Recursion"]);
	});

	it("refuses a name that cannot be stored at all", () => {
		const tooLong = "R".repeat(81);

		const fromTool = authorizeMarkConceptUnderstood(
			{ concept: tooLong, level: 2 },
			{ userId: "u1", lessonConcepts: [tooLong] },
		);

		expect(fromTool.authorized).toBe(false);
		expect(canonicalConceptNames([{ name: tooLong }])).toEqual([]);
	});
});
