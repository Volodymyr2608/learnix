import type { ParsedGlossaryItem } from "@/lib/parse/parseGlossary";

/**
 * The glossary shape both study-guide views render. It is `parseGlossary`'s
 * output by definition, not a second declaration of the same thing — a
 * structural copy would silently stop matching if the parser's output changed.
 */
export type GlossaryItem = ParsedGlossaryItem;

export type GlossaryListProps = {
	glossary: GlossaryItem[];
};
