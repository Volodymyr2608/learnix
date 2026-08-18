import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEAK_MARKERS, leakMarkersFor } from "./promptLeakMarkers";
import { STREAMING_PROMPT_VARIANTS } from "./promptVariants";

const SOURCE = "server/services/_shared/aiOutput/promptLeakMarkers.ts";

describe("leak markers are per-feature, total, and pinned (AC 5, 6)", () => {
	it("is a TOTAL record — a new AiFeature fails to compile, not silently to []", () => {
		const source = readFileSync(SOURCE, "utf-8");
		// Comments stripped: the file documents the `?? []` fallback as the thing
		// it must not do, and that sentence is not an occurrence of it.
		const code = source
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/.*$/gm, "");

		expect(code).toMatch(
			/LEAK_MARKERS:\s*Record<AiFeature, readonly string\[\]>/,
		);
		expect(code).not.toMatch(/\?\?\s*\[\]/);
	});

	it("no feature has an empty marker set (AC 6)", () => {
		for (const [feature, markers] of Object.entries(LEAK_MARKERS)) {
			expect(markers.length, `${feature} has no markers`).toBeGreaterThan(0);
		}
	});

	/**
	 * The per-variant assertion, not a per-feature one: markers covering only one
	 * branch would leave the others unchecked while the feature read as covered.
	 */
	it("every prompt variant contains at least one registered marker", () => {
		for (const variant of STREAMING_PROMPT_VARIANTS) {
			const prompt = variant.assemble().toLowerCase();
			const hit = leakMarkersFor(variant.feature).some((marker) =>
				prompt.includes(marker.toLowerCase()),
			);

			expect(hit, `no marker covers ${variant.feature}/${variant.name}`).toBe(
				true,
			);
		}
	});

	it("every registered marker is a verbatim substring of some variant of its feature", () => {
		for (const [feature, markers] of Object.entries(LEAK_MARKERS)) {
			const prompts = STREAMING_PROMPT_VARIANTS.filter(
				(v) => v.feature === feature,
			).map((v) => v.assemble().toLowerCase());

			for (const marker of markers) {
				expect(
					prompts.some((prompt) => prompt.includes(marker.toLowerCase())),
					`drifted marker on ${feature}: ${marker}`,
				).toBe(true);
			}
		}
	});

	it("markers are distinctive, not generic phrases", () => {
		for (const markers of Object.values(LEAK_MARKERS)) {
			for (const marker of markers) {
				expect(
					marker.split(/\s+/).length,
					`too generic: ${marker}`,
				).toBeGreaterThanOrEqual(6);
			}
		}
	});

	it("covers every feature's variants — no surface is enumerated but unlisted", () => {
		const featuresWithVariants = new Set(
			STREAMING_PROMPT_VARIANTS.map((v) => v.feature),
		);

		expect([...featuresWithVariants].sort()).toEqual(
			Object.keys(LEAK_MARKERS).sort(),
		);
	});
});
