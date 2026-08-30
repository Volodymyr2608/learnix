import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canonicalConceptNames } from "@/server/services/quiz/quiz.service";
import { CONVERSATION_MAX_LEVEL, QUIZ_MASTERY_LEVEL } from "./masteryLevels";

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: vi.fn(),
}));

const { authorizeAskConceptCheck } = await import(
	"@/server/services/lessonAI/toolPolicy"
);

/** A check that violates no structural rule, so only the concept is under test. */
const checkFor = (concept: string) => ({
	concept,
	question: "Which call ends a recursive descent?",
	options: [
		"The base case",
		"The first recursive call",
		"The outermost frame",
		"The largest input",
	],
	correctOption: "The base case",
});

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
	// Padding at the ends only. The pair below is the case that actually
	// separates the two canonicalisers.
	it("stores the same string from either writer for the same concept", () => {
		const stored = [{ name: "  Recursion " }];

		const fromQuiz = canonicalConceptNames(stored);
		const fromTool = authorizeAskConceptCheck(checkFor("recursion"), {
			userId: "u1",
			lessonConcepts: stored.map((c) => c.name),
			groundedByRetrieval: true,
		});

		expect(fromTool.authorized).toBe(true);
		expect(fromTool.authorized && fromTool.canonicalConcept).toBe(fromQuiz[0]);
		expect(fromQuiz).toEqual(["Recursion"]);
	});

	/**
	 * An internal whitespace RUN, not padding. `conceptKey` collapses runs, so
	 * both spellings resolve to one row — but whichever writer gets there first
	 * names it, and a student then sees "API   Routes" or "API Routes" depending
	 * on whether a quiz or a concept check was answered first. Two writers, two
	 * spellings, one concept is the shape the whole conceptKey design exists to
	 * remove.
	 */
	it("agrees on spelling when the name has an internal whitespace run", () => {
		const stored = [{ name: "API   Routes" }];

		const fromQuiz = canonicalConceptNames(stored);
		const fromTool = authorizeAskConceptCheck(checkFor("api routes"), {
			userId: "u1",
			lessonConcepts: stored.map((c) => c.name),
			groundedByRetrieval: true,
		});

		expect(fromTool.authorized).toBe(true);
		expect(fromTool.authorized && fromTool.canonicalConcept).toBe(fromQuiz[0]);
	});

	it("refuses a name that cannot be stored at all", () => {
		const tooLong = "R".repeat(81);

		const fromTool = authorizeAskConceptCheck(checkFor(tooLong), {
			userId: "u1",
			lessonConcepts: [tooLong],
			groundedByRetrieval: true,
		});

		expect(fromTool.authorized).toBe(false);
		expect(canonicalConceptNames([{ name: tooLong }])).toEqual([]);
	});
});
