import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-text contract, not a type test. `AiFeature`, `GuardContext["feature"]`
 * and `AiRateLimitFeature` are three declarations with three jobs, and TypeScript
 * cannot tell a derived alias from a hand-copied union — so the guard against a
 * future "remove the duplication" refactor has to read the source.
 */
const TYPES = readFileSync("server/services/_shared/aiGuard/types.ts", "utf-8");

const block = (declaration: RegExp): string => {
	const match = TYPES.match(declaration);
	if (!match?.[1]) throw new Error(`declaration not found: ${declaration}`);
	return match[1];
};

describe("AiFeature is a standalone union (AC 28-30)", () => {
	it("names every surface that constructs a model call", () => {
		const aiFeature = block(/export type AiFeature =([\s\S]*?);/);

		for (const feature of [
			"courseAI",
			"lessonAI",
			"lessonInsightsAI",
			"quizAI",
			"learningPathAI",
		]) {
			expect(aiFeature).toContain(`"${feature}"`);
		}
	});

	it("keeps GuardContext narrow — only the two chat surfaces run the input guard", () => {
		const guardContext = block(/export type GuardContext = \{([\s\S]*?)\n\};/);

		expect(guardContext).toContain('"courseAI" | "lessonAI"');
		expect(guardContext).not.toContain("AiFeature");
	});

	it("types SecurityEvent.feature as AiFeature, not the guard's narrow alias", () => {
		const securityEvent = block(
			/export type SecurityEvent = \{([\s\S]*?)\n\};/,
		);

		expect(securityEvent).toContain("feature: AiFeature;");
		expect(securityEvent).not.toContain('GuardContext["feature"]');
	});

	it("carries no free-text field — userId is the only bare string", () => {
		const securityEvent = block(
			/export type SecurityEvent = \{([\s\S]*?)\n\};/,
		);

		const bareStringFields = [
			...securityEvent.matchAll(/^\s*(\w+)\??: string;$/gm),
		].map(([, name]) => name);

		expect(bareStringFields).toEqual(["userId"]);
	});

	it("declares subject as an id-only, closed shape", () => {
		const securityEvent = block(
			/export type SecurityEvent = \{([\s\S]*?)\n\};/,
		);
		const subject = block(/export type SecuritySubject = \{([\s\S]*?)\n\};/);

		expect(securityEvent).toContain("subject?: SecuritySubject;");
		expect(subject).toContain("id: string;");

		const subjectFields = [...subject.matchAll(/^\s*(\w+)\??:/gm)].map(
			([, name]) => name,
		);
		expect(subjectFields.sort()).toEqual(["id", "kind"]);
	});
});
