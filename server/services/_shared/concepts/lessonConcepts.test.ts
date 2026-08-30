import { describe, expect, it } from "vitest";
import { lessonConceptNames } from "./lessonConcepts";

describe("lessonConceptNames", () => {
	it("reads the names out of a well-formed insights array", () => {
		expect(
			lessonConceptNames([
				{ name: "API Routes" },
				{ name: "Rendering Methods" },
			]),
		).toEqual(["API Routes", "Rendering Methods"]);
	});

	/**
	 * `lessonInsights.concepts` is `Json` with no schema behind it, and the list
	 * it produces becomes `toolPolicy`'s allowlist. A non-string entry used to
	 * reach the policy's `trim()` and turn a denial into an unhandled error, so
	 * every shape that is not a usable name is dropped here rather than there.
	 */
	it("drops every entry that is not a usable name", () => {
		expect(
			lessonConceptNames([
				{ name: "API Routes" },
				{ name: 42 },
				{ name: null },
				{ name: "" },
				{ name: "   " },
				{},
				"API Routes",
				null,
			]),
		).toEqual(["API Routes"]);
	});

	it("returns nothing for a lesson whose insights have not generated", () => {
		expect(lessonConceptNames(null)).toEqual([]);
		expect(lessonConceptNames(undefined)).toEqual([]);
	});

	it("returns nothing when the stored value is not an array at all", () => {
		expect(lessonConceptNames({ concepts: ["API Routes"] })).toEqual([]);
		expect(lessonConceptNames("API Routes")).toEqual([]);
	});

	/**
	 * The same spelling rule the rest of the platform uses: padding collapsed so
	 * two writers cannot disagree about whitespace, and anything that could not
	 * be stored as a concept dropped rather than passed on to a prompt.
	 */
	it("canonicalises spelling and refuses a name that could not be stored", () => {
		expect(
			lessonConceptNames([
				{ name: "  API   Routes  " },
				{ name: "R".repeat(81) },
				{ name: "R".repeat(80) },
			]),
		).toEqual(["API Routes", "R".repeat(80)]);
	});
});
