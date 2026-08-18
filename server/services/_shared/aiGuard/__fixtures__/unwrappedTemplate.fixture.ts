import { UNTRUSTED_DATA_CLAUSE } from "../messages";
import { wrapUntrustedContent } from "../wrapUntrusted";

/**
 * Fixture for wrappingCoverage.contract.test.ts. Not imported by production
 * code; it exists so the scanner's own behaviour is asserted against a file
 * whose expected findings are known exactly.
 *
 * Exactly one value here is unwrapped: `evil`.
 */
export const buildPrompt = (
	evil: string,
	lessonBody: string,
	candidates: unknown,
): string => `${UNTRUSTED_DATA_CLAUSE}

Lesson: ${wrapUntrustedContent(lessonBody, "lesson_content")}
Candidates: ${wrapUntrustedContent(JSON.stringify(candidates), "path_candidates")}
Clause again: ${JSON.stringify(UNTRUSTED_DATA_CLAUSE)}
Raw: ${evil}`;
