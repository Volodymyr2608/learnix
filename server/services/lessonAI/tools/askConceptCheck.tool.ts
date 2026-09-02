import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { MAX_CONCEPT_NAME_LENGTH } from "@/server/services/mastery/masteryLevels";
import {
	authorizeAskConceptCheck,
	CHECK_MAX_OPTIONS,
	CHECK_MIN_OPTIONS,
	CHECK_OPTION_MAX_LENGTH,
	CHECK_QUESTION_MAX_LENGTH,
	CHECK_QUESTION_MIN_LENGTH,
} from "../toolPolicy";
import type { TutorTurnState } from "../turnState";

/**
 * Every result this tool can return. All of them are bare: they acknowledge, or
 * they refuse, and none of them repeats the question, the options or the answer.
 *
 * The reason is that the tool result re-enters the model's context for the rest
 * of the turn. Echoing the authored check there would put the answer key in the
 * one place the whole design keeps it out of, and the model would then be one
 * "what was that question again?" away from reading it aloud.
 */
const PREPARED = "Question prepared. It will be shown with your reply.";
const ALREADY_PREPARED = "A question is already prepared for this turn.";

/**
 * The tutor authors a check; it never records understanding.
 *
 * This tool replaced `mark_concept_understood`, and the replacement is the
 * point: the judgement the model used to make ("has this student demonstrated
 * understanding") had no deterministic check behind it, while the one it makes
 * now ("is this a fair question about this concept") has several — grounding,
 * structural validity, and a server-side shuffle.
 *
 * Nothing here writes. The authored check is buffered on the turn and committed
 * only after the reply passes the output boundary.
 */
export const buildAskConceptCheckTool = (
	studentId: string,
	lessonId: string,
	lessonConcepts: string[],
	turn: TutorTurnState,
) =>
	tool(
		async ({
			concept,
			question,
			options,
			correctOption,
		}: {
			concept: string;
			question: string;
			options: string[];
			correctOption: string;
		}) => {
			// Authority and well-formedness before anything is kept. A refusal is an
			// ordinary tool result so the agent can recover and keep helping the
			// student — it must not throw.
			const authorization = authorizeAskConceptCheck(
				{ concept, question, options, correctOption },
				{
					userId: studentId,
					lessonConcepts,
					groundedByRetrieval: turn.grounded,
					retrievalAttempted: turn.retrievalAttempted,
					denials: turn.denials,
				},
			);
			if (!authorization.authorized) return authorization.message;

			// One check per turn. The database enforces one OPEN check per lesson,
			// but that constraint is only consulted at commit time; without this the
			// model could author five and have four silently discarded.
			if (turn.pendingCheck) return ALREADY_PREPARED;

			turn.pendingCheck = {
				studentId,
				lessonId,
				// The allowlist's spelling, never the model's.
				concept: authorization.canonicalConcept,
				question,
				options,
				// The option's own spelling. The policy accepts a folded match, so
				// the model's `correctOption` may differ from the option it names by
				// case or punctuation; storing that difference would make the check
				// unanswerable-correct.
				correctOption: authorization.canonicalCorrectOption,
			};

			return PREPARED;
		},
		{
			name: "ask_concept_check",
			description:
				"Asks the student one multiple-choice question about a concept, to check understanding they have claimed. You write the question and the options and say which option is correct; the server shuffles them and grades the answer. Call this instead of ever recording understanding yourself. Requires having called retrieve_lesson_context on this turn.",
			schema: z.object({
				concept: z
					.string()
					.min(1)
					.max(MAX_CONCEPT_NAME_LENGTH)
					.describe(
						"The concept to check, named exactly as the lesson names it",
					),
				question: z
					.string()
					.min(CHECK_QUESTION_MIN_LENGTH)
					.max(CHECK_QUESTION_MAX_LENGTH)
					.describe(
						"The question. It must not contain the correct answer's text.",
					),
				options: z
					.array(z.string().min(1).max(CHECK_OPTION_MAX_LENGTH))
					.min(CHECK_MIN_OPTIONS)
					.max(CHECK_MAX_OPTIONS)
					.describe(
						"Four or five distinct answer options. Order is ignored — the server shuffles them.",
					),
				correctOption: z
					.string()
					.min(1)
					.max(CHECK_OPTION_MAX_LENGTH)
					.describe(
						"The exact text of the correct option, copied from options",
					),
			}),
		},
	);
