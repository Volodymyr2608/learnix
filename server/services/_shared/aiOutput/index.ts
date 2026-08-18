/**
 * The shared output boundary (L5).
 *
 * The raw checks are deliberately absent from this barrel: every caller goes
 * through `validateModelText`, which is where the single security event and the
 * throw-to-rejection conversion live (AC 4). `aiOutput.contract.test.ts` pins
 * that absence.
 */

export type {
	AiOutputRuleId,
	ModelTextContext,
	ModelTextResult,
} from "./types";
export { validateModelText } from "./validateModelText";
