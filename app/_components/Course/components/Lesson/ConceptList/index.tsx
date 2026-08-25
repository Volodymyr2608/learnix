import type { ConceptListProps } from "./types";

/**
 * The one renderer for generated concepts, shared by the student's study guide
 * card and the instructor's lesson editor. Plain text by deliberate design —
 * this is model-authored content, and `aiSurfaces.ts` records `off_origin_link`
 * as n/a for `lessonInsightsAI` on the grounds that it never reaches a markdown
 * renderer. `studyGuideRendering.contract.test.ts` holds that line.
 */
export const ConceptList = ({ concepts }: ConceptListProps) => (
	<ul className="space-y-3">
		{concepts.map((concept) => (
			<li key={concept.name}>
				<p className="font-medium text-sm">{concept.name}</p>
				{concept.explanation && (
					<p className="text-muted-foreground text-xs">{concept.explanation}</p>
				)}
			</li>
		))}
	</ul>
);
