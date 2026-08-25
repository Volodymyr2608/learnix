import type { GlossaryListProps } from "./types";

/** The one renderer for generated glossary terms. Plain text — see `ConceptList`. */
export const GlossaryList = ({ glossary }: GlossaryListProps) => (
	<dl className="space-y-3">
		{glossary.map((entry) => (
			<div key={entry.term}>
				<dt className="font-medium text-sm">{entry.term}</dt>
				<dd className="text-muted-foreground text-xs">{entry.definition}</dd>
			</div>
		))}
	</dl>
);
