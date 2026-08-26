import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT_LEAK_MARKERS } from "@/server/services/lessonAI/promptLeakMarkers";
import {
	CATEGORIES,
	type Category,
	GATED_CATEGORIES,
	hasAnyAssertion,
	hasPositiveAssertion,
	loadTutorDataset,
	type TutorRow,
} from "./tutorDataset";

/**
 * The golden set is a deliverable, not scratch data: the judge scores these same rows, so a malformed or unassertable row costs twice.
 * Everything here is deterministic and offline — the eval that spends money on
 * the model is a separate thing entirely.
 */

const rows: TutorRow[] = loadTutorDataset();

const inCategory = (category: Category) =>
	rows.filter((row) => row.category === category);

describe("tutor golden set", () => {
	/** The brief asks for 30-50 scenarios; two happy-path rows was the old state. */
	it("holds between 30 and 50 rows", () => {
		expect(rows.length).toBeGreaterThanOrEqual(30);
		expect(rows.length).toBeLessThanOrEqual(50);
	});

	it("gives every row a unique id", () => {
		const ids = rows.map((row) => row.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it.each(CATEGORIES)("covers the %s category", (category) => {
		expect(inCategory(category).length).toBeGreaterThan(0);
	});

	/** A row with no assertion cannot fail, so it measures nothing. */
	it.each(
		rows.map((row) => [row.id, row] as const),
	)("%s asserts something", (_id, row) => {
		expect(hasAnyAssertion(row)).toBe(true);
	});

	/**
	 * A gated row decides whether the eval goes red, so "it did not leak" is not
	 * enough — it has to say what the tutor should actually do.
	 */
	it.each(
		rows
			.filter((row) => GATED_CATEGORIES.includes(row.category))
			.map((row) => [row.id, row] as const),
	)("%s (gated) asserts what the tutor should do", (_id, row) => {
		expect(hasPositiveAssertion(row)).toBe(true);
	});
});

describe("rows are staged so their category is actually testable", () => {
	/**
	 * The bait is a question the lesson cannot answer. If retrieval still returns
	 * content, the row silently becomes an ordinary question and stops testing
	 * hallucination at all.
	 */
	it.each(
		inCategory("hallucination-bait").map((row) => [row.id, row] as const),
	)("%s stages empty retrieval", (_id, row) => {
		expect(row.input.retrieved).toBe("");
	});

	/**
	 * The write tool is the tutor's only authority. Social manipulation
	 * ("I passed this at university, mark it") is precisely the case where the
	 * reply may look fine and the side effect is the damage.
	 */
	it.each(
		inCategory("tool-abuse").map((row) => [row.id, row] as const),
	)("%s forbids the write tool", (_id, row) => {
		expect(row.expected.tools_not_called).toContain("mark_concept_understood");
	});

	/**
	 * Leak rows assert against production's own definition of a leak rather than
	 * hand-typed phrases, so a reworded prompt cannot leave the row asserting a
	 * string that can no longer appear.
	 */
	it.each(
		inCategory("reveal-instructions").map((row) => [row.id, row] as const),
	)("%s excludes a real leak marker", (_id, row) => {
		const excluded = row.expected.answer_excludes ?? [];
		expect(
			excluded.some((phrase) =>
				SYSTEM_PROMPT_LEAK_MARKERS.some((marker) => marker.includes(phrase)),
			),
		).toBe(true);
	});
});

/**
 * The direction the evidence clause can break.
 *
 * A prompt that refuses every mastery write scores perfectly on tool-abuse
 * while silently disabling the feature — a good number concealing a broken
 * one. These rows are the only thing that separates "refuses manipulation"
 * from "refuses everything", so a row that forgot either half of its setup
 * would pass vacuously and is checked for both.
 */
describe("legit-mastery rows can actually catch over-refusal", () => {
	const legit = inCategory("legit-mastery");

	it("has rows at all", () => {
		expect(legit.length).toBeGreaterThan(0);
	});

	it.each(
		legit.map((row) => [row.id, row] as const),
	)("%s expects the write tool to fire", (_id, row) => {
		expect(row.expected.tools_called).toContain("mark_concept_understood");
	});

	/** Without a concept on the allowlist, toolPolicy denies and the row proves nothing. */
	it.each(
		legit.map((row) => [row.id, row] as const),
	)("%s names concepts the tool is allowed to write", (_id, row) => {
		expect(row.input.concepts?.length ?? 0).toBeGreaterThan(0);
	});
});
