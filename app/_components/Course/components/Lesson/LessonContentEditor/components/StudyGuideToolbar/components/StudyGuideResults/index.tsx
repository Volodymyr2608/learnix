import { ConceptList } from "@/app/_components/Course/components/Lesson/ConceptList";
import { GlossaryList } from "@/app/_components/Course/components/Lesson/GlossaryList";
import type { StudyGuideResultsProps } from "./types";

/**
 * What the instructor actually generated, expanded in full inside the lesson
 * editor. The card used to show a 180-character slice of the summary and two
 * count badges, which told an instructor how much had been written but never
 * what — so they could not judge whether regenerating was worth it.
 *
 * Every count comes from `.length` of the array rendered directly beneath it;
 * there is deliberately no separately computed count that could disagree with
 * the list. Concepts render even at zero, because an empty concept list is a
 * defect the instructor should see rather than a section worth hiding.
 */
export const StudyGuideResults = ({
	summary,
	concepts,
	glossary,
}: StudyGuideResultsProps) => (
	<div className="space-y-4">
		<section className="space-y-1.5">
			<h4 className="font-semibold text-sm">Summary</h4>
			<p className="text-muted-foreground text-sm leading-relaxed">{summary}</p>
		</section>

		<section className="space-y-2">
			<h4 className="font-semibold text-sm">
				Key Concepts ({concepts.length})
			</h4>
			<ConceptList concepts={concepts} />
		</section>

		{glossary.length > 0 && (
			<section className="space-y-2">
				<h4 className="font-semibold text-sm">Glossary ({glossary.length})</h4>
				<GlossaryList glossary={glossary} />
			</section>
		)}
	</div>
);
