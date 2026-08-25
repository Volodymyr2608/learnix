import { z } from "zod";

/**
 * `LessonInsights.glossary` is a Json column, so every consumer receives
 * `unknown` — the same problem `parseStoredConcepts` solves for `concepts`, on
 * the one column that has no boundary. Two study-guide views now map over it,
 * and both used to reach it through an unchecked `as GlossaryItem[]`, which is a
 * TypeError in the browser the moment a row holds anything else.
 *
 * Per ELEMENT, not whole-list: a glossary is a read-only aid, so showing four of
 * five terms beats showing none. `looseObject` keeps a future extra field from
 * dropping an otherwise good entry.
 *
 * This lives in `lib/` rather than at the repository boundary on purpose —
 * `learningPathAI`'s mergeAndExplain node passes the raw value through, so
 * moving the parse into `findByLessonId` changes what that node sees. See
 * `docs/specs/features/study-guide/spec.md` → Agent notes.
 */
const GlossaryItemSchema = z.looseObject({
	term: z.string(),
	definition: z.string(),
});

export type ParsedGlossaryItem = { term: string; definition: string };

export const parseGlossary = (value: unknown): ParsedGlossaryItem[] => {
	if (!Array.isArray(value)) return [];

	return value.flatMap((entry) => {
		const parsed = GlossaryItemSchema.safeParse(entry);
		if (!parsed.success) return [];
		return [{ term: parsed.data.term, definition: parsed.data.definition }];
	});
};
