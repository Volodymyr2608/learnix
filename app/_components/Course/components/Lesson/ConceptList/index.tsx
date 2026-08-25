import { cn } from "@/lib/utils/cn";
import { keyedByLabel } from "@/lib/utils/keyedByLabel";
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
 * It renders exactly what it is given and says nothing about an empty list: the
 * two callers owe their readers different things, and "Regenerate to try again"
 * is an instruction only an instructor can act on.
 *
 * Plain text by design — this is model-authored content, and `aiSurfaces.ts`
 * records `off_origin_link` as n/a for `lessonInsightsAI` on the grounds that it
 * never reaches a markdown renderer. `renderers.contract.test.ts` enforces that
 * across all of `app/`.
 */
export const ConceptList = ({ concepts, columns = 1 }: ConceptListProps) => (
	<ul className={cn("grid gap-2", columns === 2 && "md:grid-cols-2")}>
		{/* The name alone is not a key: it is model-authored and nothing in the
		    pipeline enforces uniqueness, so two concepts sharing a name would cost
		    one of them its row — exactly the "every concept appears" property this
		    view exists to provide. */}
		{keyedByLabel(concepts, (concept) => concept.name).map(
			({ key, value: concept }) => (
				<li
					className="rounded-md border-primary/25 border-l-2 bg-muted/40 px-3 py-2"
					key={key}
				>
					<p className="font-medium text-sm leading-snug">{concept.name}</p>
					{concept.explanation && (
						<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
							{concept.explanation}
						</p>
					)}
				</li>
			),
		)}
	</ul>
);
