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
	/**
	 * How many columns the entries flow into on a wide viewport. The caller
	 * decides, not the list: the instructor's editor gives it a full-width row,
	 * while the student's card sits in a narrower, indented section where a
	 * second column would be cramped. Defaults to one.
	 */
	columns?: 1 | 2;
};
