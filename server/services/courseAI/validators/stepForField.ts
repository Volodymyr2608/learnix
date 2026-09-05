import { DraftStep } from "@/generated/prisma";
import { getExtractionSchemaForStep } from "./getExtractionSchemaForStep";

/**
 * Which step stores a given field.
 *
 * `classify_intent` used to ask the model to name the step directly, from an
 * enum its prompt illustrated with one example out of four. Nothing told the
 * model that `basic` is where `title` and `level` live — the name says
 * "basic", not "the course's own attributes" — so "change the level to
 * Advanced" routed on a guess, and three of the four measured failures on
 * that node were exactly this.
 *
 * The mapping was never missing, only unreachable: `getExtractionSchemaForStep`
 * has held it all along. Reading it here rather than restating it means a step
 * that does not store the field cannot be returned, and a field that moves
 * between schemas moves its answer with it. A hand-maintained list would be a
 * second copy, and the first thing a second copy does is disagree.
 *
 * Returns `null` when no schema declares the key. The caller turns that into a
 * question for the instructor, never into a revise with no target.
 */
export const stepForField = (field: string): DraftStep | null =>
	Object.values(DraftStep).find(
		(step) => field in getExtractionSchemaForStep(step).shape,
	) ?? null;
