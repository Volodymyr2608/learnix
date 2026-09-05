import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { DraftStep } from "@/generated/prisma";
import { env } from "@/lib/env";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import {
	MODEL_MAX_RETRIES,
	MODEL_TIMEOUT_MS,
} from "@/server/services/_shared/aiLimits/modelDefaults";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { getExtractionSchemaForStep } from "@/server/services/courseAI/validators/getExtractionSchemaForStep";
import { stepForField } from "@/server/services/courseAI/validators/stepForField";

/**
 * Every field any step stores, as a closed set.
 *
 * Derived, never listed: the schemas are the vocabulary, and a second copy of
 * ten key names would disagree with them the first time a field moved.
 */
const FIELD_KEYS = Object.values(DraftStep).flatMap((step) =>
	Object.keys(getExtractionSchemaForStep(step).shape),
) as [string, ...string[]];

/**
 * The model names the FIELD, not the step — and only from the closed set.
 *
 * Naming the step was a guess dressed as a choice: the enum offered four
 * values, the prompt illustrated one, and nothing said that `basic` holds
 * `title` and `level`. `stepForField` resolves the step from the schema that
 * declares the key, so a step which cannot hold the field cannot be returned.
 *
 * `z.enum(FIELD_KEYS)` rather than `z.string()` closes the other half. A free
 * string is an open set the resolver then has to filter, which is how
 * `"constructor"` used to reach `basic`; an enum makes the unresolvable case
 * unrepresentable at the boundary instead of catchable after it — the same
 * shape as `toolPolicy`'s closed tool set. It also hands the model the key
 * vocabulary through the function schema, which the prompt never did: "add a
 * bonus section" could otherwise answer `"section"`, resolve to null and land
 * on a clarify it did not need.
 *
 * The null-target path below stays regardless. Structured output is provider
 * behaviour, not a guarantee, and a defence that exists only while the provider
 * behaves is not one.
 */
const outSchema = z.object({
	intent: z.enum(["continue", "revise", "clarify"]),
	reviseField: z.enum(FIELD_KEYS).nullable(),
	reason: z.string(),
});

/**
 * The turns this node answers without asking the model.
 *
 * A first turn has no history to revise against and an auto-trigger carries no
 * message, so both short-circuit before the provider is called. Exported because
 * `classifyIntent.eval.ts` scores those rows in a separate category — a second
 * copy of this condition in the eval would be deciding which rows count as the
 * model's, and would be wrong the first time this line moved.
 */
export const skipsModelCall = (turn: {
	history: readonly unknown[];
	userMessage: string;
}): boolean => turn.history.length === 0 || !turn.userMessage;

/**
 * Purpose: classifies the current turn as continue / revise / clarify and resolves the step to revise
 * from the field the model names; a target that resolves to the step being collected is a continue.
 * Reads: history, userMessage, currentStep, content, instructorId, generationId.
 * Writes: intent, reviseTarget.
 * Fails: never propagates — a model error is caught locally and falls back to intent "continue",
 * emitting fallback_triggered so the degradation is an event rather than a silence.
 */
export const classifyIntent = withNodeErrors(
	"classify_intent",
	async (state, config) => {
		// First turn or auto-trigger (empty message) cannot revise: skip the LLM call.
		if (skipsModelCall(state)) {
			return { intent: "continue" as const, reviseTarget: null };
		}

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
			timeout: MODEL_TIMEOUT_MS,
			maxRetries: MODEL_MAX_RETRIES,
		}).withStructuredOutput(outSchema, { method: "functionCalling" });

		const historyText = state.history
			.map(
				(m) =>
					`[${m.role}@${m.step}]: ${wrapUntrustedContent(
						m.content,
						m.role === "assistant" ? "model_output" : "course_data",
					)}`,
			)
			.join("\n");

		// What each step has already stored — every step, not only the current one.
		//
		// Scoping this to the current step was wrong and measurably so: `revise` is
		// mostly a request about an EARLIER step ("go back and add a 5th
		// objective"), so a line saying only that the current step holds nothing
		// reads as "nothing is stored anywhere" and pushes those turns to
		// `continue`. Four rows that had been passing failed on exactly that.
		const storedByStep = Object.values(DraftStep)
			.map((step) => {
				const keys = Object.keys(getExtractionSchemaForStep(step).shape).filter(
					(key) => key in state.content,
				);
				return keys.length ? `${step}: ${keys.join(", ")}` : null;
			})
			.filter(Boolean)
			.join(" | ");

		const prompt = `Classify the user's latest turn.

			CURRENT STEP: ${state.currentStep}
			ALREADY STORED: ${storedByStep || "nothing stored yet"}

			CONVERSATION SO FAR:
			${historyText}

			USER'S NEW MESSAGE:
			${state.userMessage}

			Decide in two steps, in this order.

			1. Which step's content is the user talking about? The four steps own different things. "basic" owns the course's own title, subtitle, description, category, level, language and duration. "objectives" owns what a student will be able to do after the course. "requirements" owns what a student must already know before starting. "curriculum" owns the sections and the lessons inside them. A turn that names no content at all — an approval, an affirmation, a question, a request for suggestions — belongs to CURRENT STEP.
			2. Compare that step with CURRENT STEP.
			- the same step: "continue". The user is answering the question this step asked, whether they phrase it as a statement, a suggestion, an addition, or a correction of something they said a moment ago.
			- an EARLIER step: "revise" of that step.
			- you cannot tell which step owns the content: "clarify". Use sparingly.

			The verb does not decide, the content does. Words like "add", "also", "maybe", "I think", "change" and "go back" each introduce both answers depending on which step owns what is being named, so routing on them is routing on phrasing. Tentativeness is not a reason to prefer "continue" either: a hesitant request about an earlier step is still about that earlier step.

			ALREADY STORED says what each step has saved so far. Use it to name the field, not to choose the step — an earlier step is revisable whether or not it has stored anything yet.

			When returning "revise", set reviseField to the name of the stored field to change. Name the field, not the step; the step is looked up from it. Section and lesson titles are part of "sections" — a request to rename or reorder a section names "sections", not "title", which is the course's own title.
			When returning "clarify", write a short friendly question in "reason" that resolves the ambiguity.

			Default to "continue" for approvals, affirmations, and questions.`.trim();

		try {
			const out = await model.invoke(
				[{ role: "user", content: prompt }],
				config,
			);

			if (out.intent !== "revise") {
				return { intent: out.intent, reviseTarget: null };
			}

			const target = out.reviseField ? stepForField(out.reviseField) : null;

			// A revise the graph cannot route is worse than a question: it reaches
			// revise_prior_field, which answers a null target with "I couldn't tell
			// which field to revise" and ends the turn. Asking is recoverable.
			if (!target) return { intent: "clarify" as const, reviseTarget: null };

			// A revise of the step being collected is a continue, and the comparison
			// is made here rather than asked of the model.
			//
			// Measured, not assumed: on "Students should already know basic HTML and
			// CSS", said while `requirements` was the current step, the model
			// returned `revise: requirements` in nine draws of nine and gave its own
			// reason as "the user is stating what students should already know before
			// starting the course". It identified the owning step correctly and then
			// did not compare it with CURRENT STEP. The prompt states that comparison
			// in both directions already, so more wording would have been aimed at a
			// defect the model does not have.
			//
			// The comparison is arithmetic over two enum values, for the same reason
			// the step is resolved from the schema instead of named by the model. For
			// the equal case it narrows what a turn can do: `revise_prior_field`
			// writes `content[target]` before the output boundary, and this routes
			// such a turn back to the ordinary extraction path instead.
			//
			// Equality, NOT `>=`, and the difference is a gap rather than a
			// decision: a field resolving to a LATER step ("add a lesson on
			// decorators" while collecting `basic` names `sections` → `curriculum`)
			// still reaches `revise_prior_field` and persists content for a step
			// never collected. Pre-existing, unmeasured — no row in the golden set
			// covers it — and left alone deliberately, because what a later step
			// SHOULD do is a routing decision that deserves its own measurement
			// rather than a one-line guess shipped at a review gate. Recorded in
			// ai-course-builder/spec.md §Edge cases.
			if (target === state.currentStep)
				return { intent: "continue" as const, reviseTarget: null };

			return { intent: "revise" as const, reviseTarget: target };
		} catch {
			// Fail open — a provider outage must not block the turn — but no longer
			// silently: without this event an outage and a genuine "continue" are
			// indistinguishable downstream, which is the degradation
			// `error-observability` names. Baseline zero, so any occurrence is the
			// signal.
			logSecurityEvent({
				feature: "courseAI",
				userId: state.instructorId,
				layer: "model_call_fallback",
				outcome: "fallback_triggered",
				ruleIds: ["classify_intent_unavailable"],
				score: 0,
				subject: { kind: "generation", id: state.generationId },
			});
			return { intent: "continue" as const, reviseTarget: null };
		}
	},
);
