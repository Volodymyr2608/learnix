import { cn } from "@/lib/utils/cn";
import type { GlossaryListProps } from "./types";

/**
 * The one renderer for generated glossary terms — a dictionary, not a list of
 * points. Each entry is ruled off beneath and carries no fill, so the section
 * reads as reference material and cannot be confused with the filled concept
 * tiles above it. See `ConceptList` for the other half of that pairing, and for
 * why both are plain text.
 */
export const GlossaryList = ({ glossary, columns = 1 }: GlossaryListProps) => (
	<dl className={cn("grid gap-x-8", columns === 2 && "md:grid-cols-2")}>
		{glossary.map((entry) => (
			<div className="border-border/60 border-b py-2" key={entry.term}>
				<dt className="font-semibold text-sm leading-snug">{entry.term}</dt>
				<dd className="mt-1 text-muted-foreground text-xs leading-relaxed">
					{entry.definition}
				</dd>
			</div>
		))}
	</dl>
);
