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
 *
 * `Object.hasOwn`, not `in`: `in` walks the prototype chain, and a Zod `.shape`
 * is an ordinary object, so `"constructor"`, `"toString"` and `"__proto__"` all
 * resolved to the first step tested — `basic`. The field name is chosen by the
 * model, and an instructor writing a JavaScript course says "constructor"
 * without meaning anything by it, so this was reachable by accident before it
 * was reachable by anyone's intent. It failed in the wrong direction too: a
 * confident revise on a step nobody named, down the path that runs neither
 * `validate` nor `confidence_score`, instead of the `clarify` a null produces.
 */
export const stepForField = (field: string): DraftStep | null =>
	Object.values(DraftStep).find((step) =>
		Object.hasOwn(getExtractionSchemaForStep(step).shape, field),
	) ?? null;
