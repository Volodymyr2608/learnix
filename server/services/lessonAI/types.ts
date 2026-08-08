export type ToolPolicyContext = {
	userId: string;
	/** Canonical concept names for this lesson. Empty denies every write. */
	lessonConcepts: string[];
};

export type MarkConceptRequest = {
	concept: string;
	level: number;
};

export type ToolAuthorization =
	| { authorized: true; canonicalConcept: string }
	| { authorized: false; message: string };
