import type { ParsedGlossaryItem } from "@/lib/parse/parseGlossary";

/**
 * A glossary entry as the client renders it. It is `parseGlossary`'s output by
 * definition, not a second declaration of the same thing — a structural copy
 * would silently stop matching if the parser's output changed.
 *
 * Deliberately not named `GlossaryItem`, which
 * `lessonInsightsAI/schemas/lessonInsights.schema.ts` already uses for the
 * generation-time shape.
 */
export type StudyGuideTerm = ParsedGlossaryItem;

export type GlossaryListProps = {
	glossary: StudyGuideTerm[];
	/** See `ConceptListProps.columns` — the caller owns the decision. */
	columns?: 1 | 2;
};
