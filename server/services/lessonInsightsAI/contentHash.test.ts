import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lessonContentHash } from "./contentHash";

describe("lessonContentHash", () => {
	it("is stable for the same content", () => {
		expect(lessonContentHash("a lesson")).toBe(lessonContentHash("a lesson"));
	});

	it("changes when the content changes", () => {
		expect(lessonContentHash("a lesson")).not.toBe(
			lessonContentHash("a lesson."),
		);
	});

	it("does not normalise — whitespace is part of the content", () => {
		// Pinned deliberately: if one call site ever trims and the other does not,
		// the cache and the Regenerate button disagree about the same lesson.
		expect(lessonContentHash(" a lesson ")).not.toBe(
			lessonContentHash("a lesson"),
		);
	});

	/**
	 * The whole point of extracting this. A second inline `createHash` in either
	 * path is how the write side and the read side drift apart, and the symptom
	 * is a button that lies — which is the bug this function was extracted to fix.
	 */
	it("is the only hashing in the service — no inline createHash survives", () => {
		const service = readFileSync(
			"server/services/lessonInsightsAI/lessonInsightsAI.service.ts",
			"utf-8",
		);

		expect(service).not.toMatch(/createHash\(/);
		expect(service).toMatch(/lessonContentHash\(/);
	});
});
