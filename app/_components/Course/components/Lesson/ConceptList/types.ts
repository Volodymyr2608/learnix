/**
 * Mirrors `StoredConcept` (`server/repositories/lessonInsights.conceptsSchema.ts`)
 * as the client sees it after the repository's read boundary has parsed it —
 * `explanation` is optional there, so it is optional here.
 */
export type Concept = {
	name: string;
	explanation?: string;
};

export type ConceptListProps = {
	concepts: Concept[];
};
