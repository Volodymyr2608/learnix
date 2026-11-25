import type { QuickFactProps } from "./types";

/** FR-P21: one headline term of the policy, readable at a glance. */
export const QuickFact = ({ value, label }: QuickFactProps) => (
	<div className="rounded-xl border bg-background/80 px-4 py-5 text-center shadow-sm">
		<p className="font-bold text-2xl text-primary">{value}</p>
		<p className="mt-1 text-muted-foreground text-sm">{label}</p>
	</div>
);
