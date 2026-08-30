import type { ConceptCheckPublic } from "@/server/repositories/conceptCheck.repository";
import type { AnswerCheckResult } from "@/server/services/conceptCheck/conceptCheck.service";

/**
 * The panel's decisions, as functions rather than expressions buried in JSX, so
 * they can be tested without a DOM.
 */

/**
 * Which check the panel is showing.
 *
 * `pendingCheck` returns only PENDING rows, so an answered check is gone from
 * it the moment the answer lands. Showing the held copy instead keeps the
 * question on screen next to its result — without it the panel unmounts in the
 * same tick the verdict arrives and the student never learns whether they were
 * right. A newly issued check always wins, so the panel follows the tutor and
 * never strands the student on a question that has already been graded.
 */
export const visibleCheck = (
	pending: ConceptCheckPublic | null,
	answered: ConceptCheckPublic | null,
): ConceptCheckPublic | null => pending ?? answered;

/**
 * The panel renders only for a check it can actually draw. A second submission
 * is prevented by locking once a result is in, not by unmounting the panel.
 */
export const shouldRenderPanel = (
	isLoading: boolean,
	check: ConceptCheckPublic | null,
): boolean => !isLoading && check !== null;

/** Locked while the answer is in flight, and permanently once it has landed. */
export const isLocked = (
	isSubmitting: boolean,
	result: AnswerCheckResult | null,
): boolean => isSubmitting || result !== null;

export const isSubmitDisabled = (
	selected: string | null,
	locked: boolean,
): boolean => selected === null || locked;

/**
 * The position the mutation submits. Resolved against the options the SERVER
 * sent, so a selection that is not among them yields -1 and is not submitted at
 * all rather than being sent as an out-of-range index.
 */
export const selectedOptionIndex = (
	options: string[],
	selected: string | null,
): number => (selected === null ? -1 : options.indexOf(selected));
