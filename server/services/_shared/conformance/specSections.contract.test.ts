import { existsSync, readdirSync, readFileSync } from "node:fs";
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
 * Sections the 2026-11-02 Spec Driven Development standard added (§4). They are
 * about how a decision was reached, not about what a model is allowed to do, so
 * the AI-surface rule does not owe them — the new-standard ratchet below does.
 * `Constraints` and the two new NFR subsections are conditional even there.
 */
const NEW_STANDARD_SECTIONS = [
	"Problem statement",
	"Discovery",
	"Ambiguities",
	"Assumptions",
	"Constraints",
	"User flow",
	"Non-functional requirements",
	"Accessibility",
	"Maintainability",
	"Alternatives",
	"Trade-offs",
	"Decision",
];

/**
 * Renames made by the same standard, new name → the name older specs carry.
 * Either heading satisfies the section, so the rename does not turn every
 * AI-surface spec red overnight; a reopened spec picks up the new name.
 */
const LEGACY_NAME: Record<string, string> = {
	"Business / user value": "Business goal",
	"Functional requirements": "Supported use cases",
	"Failure scenarios": "Failure & fallback",
};

/**
 * Required in every spec written under the new standard (§4 rows marked `R`).
 * Retyped rather than parsed from template prose, and kept honest by a test
 * asserting each one is still a template heading.
 */
const REQUIRED_ON_NEW_STANDARD = [
	"Description",
	"Problem statement",
	"Business / user value",
	"Discovery",
	"Ambiguities",
	"Assumptions",
	"User flow",
	"Functional requirements",
	"Alternatives",
	"Trade-offs",
	"Decision",
	"Acceptance criteria",
	"Source of truth",
	"Agent notes",
];

/**
 * Specs that predate the standard. Not backfilled (§4): one leaves this list
 * when it is reopened and rewritten to the new sections. The list can shrink and
 * never grow — a new spec is held to the standard from its first commit, and a
 * legacy spec that already complies must be dropped from here.
 */
const LEGACY_SPECS = [
	"account-deletion-data-retention",
	"achievements",
	"ai-chat-route-authorization",
	"ai-course-builder",
	"ai-defence-layers",
	"ai-evaluation-harness",
	"ai-flow-contracts",
	"ai-guard-encoding-coverage",
	"ai-guard-multilingual-coverage",
	"ai-input-trust-boundary",
	"ai-observability",
	"ai-tutor-guardrails",
	"billing",
	"certificates",
	"distributed-ai-rate-limiter",
	"error-observability",
	"instructor-mobile",
	"learning-path",
	"messages",
	"mobile-responsive",
	"payments",
	"quiz-answer-key",
	"quiz-generation",
	"semantic-search-recommendations",
	"skill-progress",
	"study-guide",
];

/**
 * Sections a spec may keep in a sibling design-record file instead of in
 * `spec.md` (documentation-process.md §2, since 2026-11-21): `spec.md` then holds
 * the requirements alone, and the record of how they were reached sits beside
 * it. The sibling must carry the heading itself, so moving a section never
 * quietly deletes it.
 */
const SIBLING_SECTIONS: Record<string, string> = {
	Discovery: "design/findings.md",
	Ambiguities: "design/findings.md",
	Alternatives: "design/decision-summary.md",
	"Trade-offs": "design/decision-summary.md",
	Decision: "design/decision-summary.md",
};

/**
 * Satisfied by a sibling `security.md` instead of a section, which is what
 * complex tier does (§4) — `ai-tutor-guardrails` carries one.
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
 * describe layers shared across surfaces and own none of them, and
 * `quiz-answer-key` owns the student read path and attempt caps rather than
 * generation, which is why `quiz-generation` exists as its own document.
 */
const SPEC_FOR: Record<AiFeature, SpecBinding> = {
	courseAI: { slug: "ai-course-builder" },
	lessonAI: { slug: "ai-tutor-guardrails" },
	lessonInsightsAI: { slug: "study-guide" },
	quizAI: { slug: "quiz-generation" },
	learningPathAI: { slug: "learning-path" },
};

/**
 * Doc debt, per spec, by section name rather than by count: a swap — one section
 * written while another is dropped — must not net out to green.
 *
 * **Empty, and that is the assertion.** It held 36 missing sections across three
 * specs when this test was written; each migration deleted an entry until there
 * was nothing left, which is the only ending a ratchet is allowed to have. It
 * stays as a typed map rather than being deleted so that a spec reopened
 * mid-migration has somewhere honest to sit — but a new entry here needs the
 * same justification a skipped test would.
 *
 * `missingFile` in SPEC_FOR is likewise unused now: `learningPathAI` was the
 * last surface without a spec, and writing one forced its pin out — which is the
 * behaviour the "pins the surfaces that have no spec at all" test asserts.
 */
const PENDING: Record<string, string[]> = {};

/**
 * `##` and `###` both count: the new standard nests Performance / Security /
 * Observability under Non-functional requirements, while older specs carry them
 * as top-level sections. Either placement satisfies the section.
 */
const headings = (markdown: string): string[] =>
	[...markdown.matchAll(/^#{2,3} (.+)$/gm)].map((match) =>
		(match[1] ?? "").trim(),
	);

const templateSections = (): string[] =>
	headings(readFileSync(TEMPLATE, "utf-8"));

const requiredOnAiSurface = (): string[] =>
	templateSections().filter(
		(section) =>
			section !== OPTIONAL_ON_AI_SURFACE &&
			!NEW_STANDARD_SECTIONS.includes(section),
	);

const specPath = (slug: string): string => `${FEATURES_DIR}/${slug}/spec.md`;

const hasSection = (present: string[], section: string): boolean => {
	const legacy = LEGACY_NAME[section];
	return present.includes(section) || (!!legacy && present.includes(legacy));
};

const inSibling = (slug: string, section: string): boolean => {
	const sibling = SIBLING_SECTIONS[section];
	if (!sibling) return false;
	const path = `${FEATURES_DIR}/${slug}/${sibling}`;
	return (
		existsSync(path) && headings(readFileSync(path, "utf-8")).includes(section)
	);
};

const missingFrom = (slug: string, required: string[]): string[] => {
	const present = headings(readFileSync(specPath(slug), "utf-8"));
	const hasSecurityDoc = existsSync(`${FEATURES_DIR}/${slug}/security.md`);

	return required.filter((section) => {
		if (section === SECURITY && hasSecurityDoc) return false;
		if (hasSection(present, section)) return false;
		return !inSibling(slug, section);
	});
};

const missingSections = (slug: string): string[] =>
	missingFrom(slug, requiredOnAiSurface());

const allSpecSlugs = (): string[] =>
	readdirSync(FEATURES_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((slug) => existsSync(specPath(slug)));

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

describe("specs written under the 2026-11-02 standard carry its sections", () => {
	it("requires only sections the template still has", () => {
		// Guards the retyped list: a renamed template heading would otherwise
		// make every new spec fail on a section nobody can write any more.
		const sections = templateSections();
		const stale = [
			...REQUIRED_ON_NEW_STANDARD,
			...NEW_STANDARD_SECTIONS,
			...Object.keys(SIBLING_SECTIONS),
		].filter((section) => !sections.includes(section));

		expect(stale).toEqual([]);
	});

	it("holds every non-legacy spec to the required sections", () => {
		const actual: Record<string, string[]> = {};

		for (const slug of allSpecSlugs()) {
			if (LEGACY_SPECS.includes(slug)) continue;
			const missing = missingFrom(slug, REQUIRED_ON_NEW_STANDARD);
			if (missing.length > 0) actual[slug] = missing;
		}

		expect(
			actual,
			"A spec written under the new standard is missing a required section " +
				"(documentation-process.md §4). Write it — new specs do not join LEGACY_SPECS.",
		).toEqual({});
	});

	it("lets the legacy list only shrink", () => {
		const existing = allSpecSlugs();
		const gone = LEGACY_SPECS.filter((slug) => !existing.includes(slug));
		const migrated = LEGACY_SPECS.filter(
			(slug) =>
				existing.includes(slug) &&
				missingFrom(slug, REQUIRED_ON_NEW_STANDARD).length === 0,
		);

		expect(
			{ gone, migrated },
			"Drop these from LEGACY_SPECS: `gone` no longer exist, `migrated` already meet " +
				"the standard and must now be held to it.",
		).toEqual({ gone: [], migrated: [] });
	});
});
