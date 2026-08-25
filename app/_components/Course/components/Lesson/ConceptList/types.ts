import type { StoredConcept } from "@/server/repositories/lessonInsights.conceptsSchema";

/**
 * A concept as the *client* receives it — the stored shape, after the
 * repository read boundary has parsed it. Derived rather than restated: a
 * hand-written `{ name: string; explanation?: string }` would silently stop
 * matching if the stored schema changed.
 *
 * Deliberately not named `Concept`: `lessonInsightsAI/schemas/lessonInsights.schema.ts`
 * already exports that name for the *generation-time* shape, where `explanation`
 * is required and the array is bounded 3–7. Two different types under one name
 * is an auto-import trap.
 *
 * Type-only import, so nothing from the server module reaches the client bundle.
 */
export type StudyGuideConcept = StoredConcept;

export type ConceptListProps = {
	concepts: StudyGuideConcept[];
	/**
	 * How many columns the entries flow into on a wide viewport. The caller
	 * decides, not the list: the instructor's editor gives it a full-width row,
	 * while the student's card sits in a narrower, indented section where a
	 * second column would be cramped. Defaults to one.
	 */
	columns?: 1 | 2;
};
