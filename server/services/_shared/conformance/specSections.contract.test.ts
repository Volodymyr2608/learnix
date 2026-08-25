import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AiFeature } from "@/server/services/_shared/aiGuard/types";
import { AI_SURFACES } from "./aiSurfaces";

/**
 * `documentation-process.md` §4 says the conditional sections are *mandatory*
 * for an AI surface. Until now nothing checked it, and the first AI spec written
 * after the rule (`study-guide`, 2026-08-25) already shipped without three of
 * them — which is the whole argument for enforcing a doc rule instead of
 * restating it.
 *
 * Two things make this checkable rather than a matter of taste:
 *
 * 1. **What counts as an AI surface** is already decided by `AI_SURFACES`, whose
 *    own contract test re-derives it from the source — a service that constructs
 *    a model and appears nowhere in that registry fails there, so a surface
 *    cannot dodge this test by staying undeclared.
 * 2. **Which sections a spec owes** is read from `docs/templates/feature-spec.md`
 *    rather than retyped here. The template is the source of truth; a section
 *    added to it becomes required on the next run, and this test cannot drift
 *    from the template the way a hardcoded list would.
 *
 * The binding from a surface to the spec that owns it lives here and not in
 * `aiSurfaces.ts` on purpose: that registry is re-derived from code, and "which
 * document describes this" is not derivable from code.
 */

const TEMPLATE = "docs/templates/feature-spec.md";
const FEATURES_DIR = "docs/specs/features";

/**
 * Every section except this one is mandatory on an AI surface. It stays optional
 * because a feature that cut nothing has nothing to write under it, and an empty
 * heading is worse than no heading (§4).
 */
const OPTIONAL_ON_AI_SURFACE = "Unsupported use cases";

/**
 * Satisfied by a sibling `security.md` instead of a section, which is what
 * complex tier does (§4) — `ai-tutor-guardrails` and `quiz-answer-key` both
 * carry one.
 */
const SECURITY = "Security";

type SpecBinding =
	/** The spec that owns this surface. */
	| { slug: string }
	/**
	 * No spec exists at all. Pinned rather than skipped: writing one must force
	 * this entry out, or "no document" quietly reads the same as "compliant".
	 */
	| { slug: string; missingFile: true };

/**
 * One spec per surface — the document a reader is sent to for *this* flow, not
 * every spec that mentions it. `ai-defence-layers` and `ai-input-trust-boundary`
 * describe layers shared across surfaces and own none of them.
 */
const SPEC_FOR: Record<AiFeature, SpecBinding> = {
	courseAI: { slug: "ai-course-builder" },
	lessonAI: { slug: "ai-tutor-guardrails" },
	lessonInsightsAI: { slug: "study-guide" },
	quizAI: { slug: "quiz-answer-key" },
	learningPathAI: { slug: "learning-path", missingFile: true },
};

/**
 * The doc debt as it stands, per surface, by section name rather than by count:
 * a swap — one section written while another is dropped — must not net out to
 * green. It cannot grow, and every migration empties one entry.
 *
 * `ai-tutor-guardrails` is absent because it is complete; that is what a spec
 * leaving this list looks like.
 */
const PENDING: Record<string, string[]> = {
	"ai-course-builder": [
		"Description",
		"Business goal",
		"Supported use cases",
		"Inputs",
		"Outputs",
		"Validation",
		"Edge cases",
		"Failure & fallback",
		"Security",
		"Performance",
		"Observability",
		"Test & eval scenarios",
		"Source of truth",
	],
	"study-guide": [
		"Description",
		"Business goal",
		"Supported use cases",
		"Inputs",
		"Outputs",
		"Validation",
		"Failure & fallback",
		"Performance",
		"Observability",
		"Test & eval scenarios",
		"Source of truth",
	],
	"quiz-answer-key": [
		"Description",
		"Business goal",
		"Supported use cases",
		"Inputs",
		"Outputs",
		"Validation",
		"Edge cases",
		"Failure & fallback",
		"Performance",
		"Observability",
		"Test & eval scenarios",
		"Source of truth",
	],
};

const headings = (markdown: string): string[] =>
	[...markdown.matchAll(/^## (.+)$/gm)].map((match) => (match[1] ?? "").trim());

const templateSections = (): string[] =>
	headings(readFileSync(TEMPLATE, "utf-8"));

const requiredOnAiSurface = (): string[] =>
	templateSections().filter((section) => section !== OPTIONAL_ON_AI_SURFACE);

const specPath = (slug: string): string => `${FEATURES_DIR}/${slug}/spec.md`;

const missingSections = (slug: string): string[] => {
	const present = headings(readFileSync(specPath(slug), "utf-8"));
	const hasSecurityDoc = existsSync(`${FEATURES_DIR}/${slug}/security.md`);

	return requiredOnAiSurface().filter((section) => {
		if (section === SECURITY && hasSecurityDoc) return false;
		return !present.includes(section);
	});
};

describe("AI-surface specs carry the sections §4 makes mandatory", () => {
	it("reads a section list from the template", () => {
		// Guards the reader itself: a template whose headings stopped matching
		// would make every assertion below pass while requiring nothing.
		const sections = templateSections();

		expect(sections.length).toBeGreaterThanOrEqual(15);
		expect(sections).toContain("Acceptance criteria");
		expect(sections).toContain(OPTIONAL_ON_AI_SURFACE);
	});

	it("binds every declared AI surface to a spec", () => {
		const unbound = AI_SURFACES.map((surface) => surface.feature).filter(
			(feature) => !SPEC_FOR[feature],
		);

		expect(
			unbound,
			"A new AI surface was declared in aiSurfaces.ts with no spec bound to it. " +
				"Add it to SPEC_FOR — a surface nobody documented is the case this catches.",
		).toEqual([]);
	});

	it("pins the surfaces that have no spec at all", () => {
		const absent = Object.entries(SPEC_FOR)
			.filter(([, binding]) => !existsSync(specPath(binding.slug)))
			.map(([feature]) => feature);

		const pinned = Object.entries(SPEC_FOR)
			.filter(([, binding]) => "missingFile" in binding)
			.map(([feature]) => feature);

		expect(
			absent,
			absent.length > pinned.length
				? "A bound spec.md does not exist. Write it, or mark the binding `missingFile: true` deliberately."
				: "A spec now exists for a surface pinned as missing — drop `missingFile` from its SPEC_FOR entry.",
		).toEqual(pinned);
	});

	it("holds every AI-surface spec to the full section list", () => {
		const actual: Record<string, string[]> = {};

		for (const binding of Object.values(SPEC_FOR)) {
			if ("missingFile" in binding) continue;
			const missing = missingSections(binding.slug);
			if (missing.length > 0) actual[binding.slug] = missing;
		}

		expect(
			actual,
			"An AI-surface spec is missing a mandatory section (documentation-process.md §4). " +
				"Write the section, then delete it from PENDING — a spec that gained one but lost " +
				"another must not net out to green.",
		).toEqual(PENDING);
	});
});
