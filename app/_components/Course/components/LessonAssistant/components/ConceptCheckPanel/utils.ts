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

/**
 * An answered check, carried with the conversation turn it was answered in.
 *
 * The turn is what bounds how long it is held. Held without one it was held
 * forever: nothing in the panel ever cleared it, so a graded question stayed
 * above the thread for the rest of the session, un-dismissable, while the
 * student went on asking about something else.
 */
export type HeldCheck = { check: ConceptCheckPublic; turn: number };

/**
 * The answered check still worth showing, or null.
 *
 * A verdict belongs to the turn it arrived in. Sending the next message is the
 * student saying they have read it, and is the only thing that ends the hold —
 * an OPEN check is not held at all, it comes from `pendingCheck`, and a question
 * nobody has answered must outlive any number of turns.
 */
export const heldForTurn = (
	held: HeldCheck | null,
	turn: number,
): ConceptCheckPublic | null =>
	held && held.turn === turn ? held.check : null;

/** The option a student chose, carried with the check that offered it. */
export type Selection = { checkId: string; option: string };

/**
 * The chosen option to draw as selected, or null.
 *
 * Bound to its check for the same reason the verdict is: carried across to the
 * next question it sat selected against options that never included it, where
 * `selectedOptionIndex` resolved it to -1 and Submit silently did nothing.
 */
export const selectionFor = (
	shown: ConceptCheckPublic | null,
	selection: Selection | null,
): string | null =>
	shown && selection && selection.checkId === shown.id
		? selection.option
		: null;

/**
 * A verdict, carried with the id of the check it graded.
 *
 * The mutation's own `data` cannot stand in for this: it survives the check it
 * belongs to, while the panel deliberately outlives a single check. Pairing the
 * two is what lets `verdictFor` refuse to show a result against a question it
 * never graded.
 */
export type GradedCheck = { checkId: string; result: AnswerCheckResult };

/**
 * The verdict to show under the check currently on screen, or null.
 *
 * A verdict belongs to one check and to no other. Read straight off the
 * mutation it locked every subsequent question behind the previous answer:
 * `isLocked` consults the result and the Submit button renders only while there
 * is none, so the second check a student was issued arrived unanswerable, under
 * the first one's "Not quite". That is exactly the state MQ-1b has to reach.
 */
export const verdictFor = (
	shown: ConceptCheckPublic | null,
	graded: GradedCheck | null,
): AnswerCheckResult | null =>
	shown && graded && graded.checkId === shown.id ? graded.result : null;

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
