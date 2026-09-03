import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * spec.md AC 3, for the three surfaces whose services are too heavy to drive end
 * to end here (each pulls in Prisma, the guard, and its own graph). The idiom is
 * the source scan `aiLimits.contract.test.ts` already uses for exactly this kind
 * of shape assertion — see `attachment.contract.test.ts` for the strict version
 * that owns the rule; this file documents the per-site expectation while the
 * sites are being wired.
 */

const source = (file: string) => readFileSync(file, "utf-8");

const SITES: Array<[string, string]> = [
	["quizAI", "server/services/quizAI/quizAI.service.ts"],
	[
		"lessonInsightsAI",
		"server/services/lessonInsightsAI/lessonInsightsAI.service.ts",
	],
	[
		"learningPathAI",
		"server/services/learningPathAI/learningPathAI.service.ts",
	],
];

describe("the three invoke-based surfaces attach the handler (AC 3)", () => {
	it.each(SITES)("%s builds a handler", (_name, file) => {
		expect(source(file)).toMatch(/aiMetricsHandler\(/);
	});

	it.each(SITES)("%s passes it as callbacks", (_name, file) => {
		expect(source(file)).toMatch(/callbacks:\s*\[/);
	});

	it.each(SITES)("%s summarises the turn", (_name, file) => {
		expect(source(file)).toMatch(/emitSummary\(/);
	});

	it("learningPathAI attaches on BOTH of its roots", () => {
		// It has an invoke path and a streamEvents path; metering one and not the
		// other makes the same feature's cost depend on which button was pressed.
		const text = source(SITES[2]?.[1] as string);
		expect(text.match(/callbacks:\s*\[/g) ?? []).toHaveLength(2);
	});
});
