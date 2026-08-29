import type { ConceptCheckPublic } from "@/server/repositories/conceptCheck.repository";
import type { AnswerCheckResult } from "@/server/services/conceptCheck/conceptCheck.service";

/**
 * The panel's decisions, as functions rather than expressions buried in JSX, so
 * they can be tested without a DOM.
 */

/**
 * The panel renders only for a check that is actually open. It disappears once
 * answered rather than lingering: the tutor asks one question at a time, and a
 * stale panel invites a second submission the server would refuse anyway.
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
