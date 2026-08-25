import { cn } from "@/lib/utils/cn";
import { isInLastRow } from "@/lib/utils/isInLastRow";
import { keyedByLabel } from "@/lib/utils/keyedByLabel";
import type { GlossaryListProps } from "./types";

/**
 * The one renderer for generated glossary terms — a dictionary, not a list of
 * points. Each entry is ruled off beneath and carries no fill, so the section
 * reads as reference material and cannot be confused with the filled concept
 * tiles above it. See `ConceptList` for the other half of that pairing, for why
 * both are plain text, and `keyedByLabel` for why the key is not the term alone.
 *
 * The rules separate entries; they do not close the block. `last:` alone cannot
 * express that in two columns — with an even number of terms the bottom-left one
 * is not `:last-child` and would keep a rule under it, drawing half a line
 * across the card. Hence `isInLastRow`, applied only at `md:` because that is
 * where the second column appears.
 */
export const GlossaryList = ({ glossary, columns = 1 }: GlossaryListProps) => (
	<dl className={cn("grid gap-x-8", columns === 2 && "md:grid-cols-2")}>
		{keyedByLabel(glossary, (entry) => entry.term).map(
			({ key, value: entry }, index) => (
				<div
					className={cn(
						"border-border/60 border-b py-2 last:border-b-0",
						columns === 2 &&
							isInLastRow(index, glossary.length, 2) &&
							"md:border-b-0",
					)}
					key={key}
				>
					<dt className="font-semibold text-sm leading-snug">{entry.term}</dt>
					<dd className="mt-1 text-muted-foreground text-xs leading-relaxed">
						{entry.definition}
					</dd>
				</div>
			),
		)}
	</dl>
);
