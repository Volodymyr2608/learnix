import { z } from "zod";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";

/**
 * The STORED shape — the concepts ARRAY, not the `{ concepts: [...] }` wrapper
 * the generation schema describes. The service persists
 * `result.concepts.concepts`, so parsing rows with ConceptsSchema would fail on
 * every row.
 *
 * No CARDINALITY bound: 3–7 is a generation-time rule and must not gate a read,
 * or a row written under a different rule becomes unreadable. The ELEMENT length
 * bound stays, because dropping it is not the same decision: concept names are
 * interpolated into the tutor's system prompt and written verbatim into
 * ConceptMastery.concept. 200 is generous relative to generation's 80 and still
 * bounded.
 */
export const StoredConceptSchema = z.looseObject({
	name: z.string().max(200),
	explanation: z.string().max(2000).optional(),
});

export const StoredConceptsSchema = z.array(StoredConceptSchema);

export type StoredConcept = z.infer<typeof StoredConceptSchema>;

/**
 * One parse for both read paths. A stored value that does not conform yields an
 * empty list and one telemetry event — never a throw. Three consumers used to
 * call `.map` on whatever was in the column, so a row holding a string was a
 * live TypeError on the lesson page, the tutor and the quiz service.
 *
 * `[]` is the right fail direction for every consumer: the tutor's allowlist
 * goes empty and toolPolicy denies all mastery writes, the study guide degrades,
 * and the quiz service under-grants rather than over-grants.
 */
export const parseStoredConcepts = (
	value: unknown,
	context: { lessonId: string },
): StoredConcept[] => {
	const parsed = StoredConceptsSchema.safeParse(value);
	if (parsed.success) return parsed.data;

	logSecurityEvent({
		feature: "lessonInsightsAI",
		userId: "system",
		layer: "output_validation",
		outcome: "fallback_triggered",
		ruleIds: ["stored_concepts_malformed"],
		score: 0,
		subject: { kind: "lesson", id: context.lessonId },
	});
	return [];
};

/**
 * The per-element form, for the read path that maps many lessons at once: a
 * single bad element drops itself rather than the whole lesson's list. An
 * `Array.isArray` guard would let `[{ notName: 1 }]` through and yield
 * `[undefined]` downstream, which is the shape this boundary exists to stop.
 */
export const parseStoredConceptsPerElement = (
	value: unknown,
	context: { lessonId: string },
): StoredConcept[] => {
	if (!Array.isArray(value)) return parseStoredConcepts(value, context);

	const kept = value.flatMap((element) => {
		const parsed = StoredConceptSchema.safeParse(element);
		return parsed.success ? [parsed.data] : [];
	});

	if (kept.length !== value.length) {
		logSecurityEvent({
			feature: "lessonInsightsAI",
			userId: "system",
			layer: "output_validation",
			outcome: "fallback_triggered",
			ruleIds: ["stored_concept_element_malformed"],
			score: 0,
			subject: { kind: "lesson", id: context.lessonId },
		});
	}

	return kept;
};
