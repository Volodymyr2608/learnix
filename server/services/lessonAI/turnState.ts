import type { IssueCheckInput } from "@/server/services/conceptCheck/conceptCheck.service";
import { newTurnDenialLedger, type TurnDenialLedger } from "./toolPolicy";

/**
 * The mutable state one tutor turn carries across its tool calls.
 *
 * It exists because two of the tutor's guarantees are properties of the TURN,
 * not of any single call: a check may only be authored on a turn that read the
 * lesson, and the authored check must not reach the database until the turn's
 * reply has passed the output boundary. Both need somewhere to live that the
 * tools and the streaming service can both see.
 *
 * Created once per turn and never shared between turns — a leaked instance
 * would carry one student's grounding, and their buffered answer key, into
 * another's conversation.
 */
export type TutorTurnState = {
	/**
	 * True once `retrieve_lesson_context` has actually run on this turn. The
	 * grounding rule reads it, and nothing else may set it — a flag the model can
	 * influence is not grounding.
	 */
	grounded: boolean;
	/**
	 * The one check authored this turn, held here rather than written. It is
	 * committed with the assistant message, after the reply is judged valid, so a
	 * rejected or abandoned turn leaves no artifact by construction rather than by
	 * a compensating delete.
	 */
	pendingCheck: IssueCheckInput | null;
	/** One denial event per class per turn, rather than one per retry. */
	denials: TurnDenialLedger;
};

export const newTurnState = (): TutorTurnState => ({
	grounded: false,
	pendingCheck: null,
	denials: newTurnDenialLedger(),
});
