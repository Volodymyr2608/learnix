import type { SectionHeadingProps } from "./types";

/**
 * The shared eyebrow above each column. The count sits beside the label rather
 * than inside it — it is a fact about the list, not part of its name — and is
 * always the length of the array rendered directly beneath, so the two can
 * never disagree.
 */
export const SectionHeading = ({ label, count }: SectionHeadingProps) => (
	<div className="mb-2.5 flex items-baseline gap-2">
		<h4 className="font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-wider">
			{label}
		</h4>
		<span className="text-[0.6875rem] text-muted-foreground/60 tabular-nums">
			{count}
		</span>
	</div>
);
