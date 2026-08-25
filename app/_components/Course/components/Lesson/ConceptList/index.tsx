import { cn } from "@/lib/utils/cn";
import type { ConceptListProps } from "./types";

/**
 * The one renderer for generated concepts, shared by the student's study guide
 * card and the instructor's lesson editor.
 *
 * A concept is something the lesson *teaches* — a claim with an explanation —
 * so it reads as a filled tile with a left accent rule. Its sibling
 * `GlossaryList` deliberately looks nothing like it — unfilled, ruled off like a
 * dictionary entry: a term is something you look up, not something you are
 * taught.
 *
 * Plain text by design — this is model-authored content, and `aiSurfaces.ts`
 * records `off_origin_link` as n/a for `lessonInsightsAI` on the grounds that it
 * never reaches a markdown renderer. `renderers.contract.test.ts` enforces that
 * across all of `app/`.
 */
export const ConceptList = ({ concepts, columns = 1 }: ConceptListProps) => {
	if (concepts.length === 0) {
		return (
			<p className="text-muted-foreground text-xs italic">
				No concepts in this guide. Regenerate to try again.
			</p>
		);
	}

	return (
		<ul className={cn("grid gap-2", columns === 2 && "md:grid-cols-2")}>
			{concepts.map((concept) => (
				<li
					className="rounded-md border-primary/25 border-l-2 bg-muted/40 px-3 py-2"
					key={concept.name}
				>
					<p className="font-medium text-sm leading-snug">{concept.name}</p>
					{concept.explanation && (
						<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
							{concept.explanation}
						</p>
					)}
				</li>
			))}
		</ul>
	);
};
