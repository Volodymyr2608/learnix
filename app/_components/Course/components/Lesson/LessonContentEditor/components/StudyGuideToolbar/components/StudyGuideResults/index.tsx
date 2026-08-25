import { Separator } from "@/app/_components/_shared/ui/separator";
import { ConceptList } from "@/app/_components/Course/components/Lesson/ConceptList";
import { GlossaryList } from "@/app/_components/Course/components/Lesson/GlossaryList";
import { SectionHeading } from "./components/SectionHeading";
import type { StudyGuideResultsProps } from "./types";

/**
 * What the instructor actually generated, laid out to be read. The summary
 * leads across the full width of the card; concepts and glossary then each take
 * a full row and split into two columns internally, which halves the card's
 * height without putting either one in a narrow strip.
 *
 * Nothing scrolls inside the card and nothing is truncated — the whole point is
 * that the instructor can see what was written under their name and judge
 * whether it is worth regenerating.
 *
 * The card this replaced showed a 180-character slice of the summary and two
 * count badges: how much had been written, but never what.
 *
 * The empty-concepts message lives here rather than in `ConceptList` because it
 * tells the reader to regenerate, and only an instructor can. The glossary has
 * no equivalent: a guide legitimately has no terms, so that section is omitted
 * rather than explained.
 */
export const StudyGuideResults = ({
	summary,
	concepts,
	glossary,
}: StudyGuideResultsProps) => (
	<div className="space-y-5">
		<p className="text-foreground/80 text-sm leading-relaxed">{summary}</p>

		<Separator />

		<section>
			<SectionHeading count={concepts.length} label="Key concepts" />
			{concepts.length === 0 && (
				<p className="text-muted-foreground text-xs italic">
					No concepts in this guide. Regenerate to try again.
				</p>
			)}
			{concepts.length > 0 && <ConceptList columns={2} concepts={concepts} />}
		</section>

		{glossary.length > 0 && (
			<>
				<Separator />

				<section>
					<SectionHeading count={glossary.length} label="Glossary" />
					<GlossaryList columns={2} glossary={glossary} />
				</section>
			</>
		)}
	</div>
);
