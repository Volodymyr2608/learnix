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
 * The model names the FIELD, not the step.
 *
 * Naming the step was a guess dressed as a choice: the enum offered four
 * values, the prompt illustrated one, and nothing said that `basic` holds
 * `title` and `level`. `stepForField` resolves the step from the schema that
 * declares the key, so a step which cannot hold the field cannot be returned.
 */
const outSchema = z.object({
	intent: z.enum(["continue", "revise", "clarify"]),
	reviseField: z.string().nullable(),
	reason: z.string(),
});

/**
 * Purpose: classifies the current turn as continue / revise / clarify and names the step to revise.
 * Reads: history, userMessage, currentStep.
 * Writes: intent, reviseTarget.
 * Fails: never propagates — a model error is caught locally and falls back to intent "continue",
 * so a provider outage silently degrades routing instead of surfacing.
 */
export const classifyIntent = withNodeErrors(
	"classify_intent",
	async (state, config) => {
		// First turn or auto-trigger (empty message) cannot revise: skip the LLM call.
		if (state.history.length === 0 || !state.userMessage) {
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

			Decide:
			- "continue": the user is approving, moving forward, asking a question, or supplying content for the CURRENT step for the first time. A step still being collected has produced nothing to revise, so answering its question is always "continue" — even when the user says "add".
			- "revise": the user wants to change content an EARLIER step already produced, or content this step produced on an earlier turn. Look at ALREADY STORED and at the conversation: content named there exists and can be revised. The distinction is produced-already versus being-collected-now, not adding versus approving.
			- The content the user names decides the step, and the rule has two halves. If what they describe belongs to CURRENT STEP, it is "continue" — they are answering the question this step asked, whether they phrase it as a statement, a suggestion, or an addition. If it belongs to a different step — objectives while collecting requirements, requirements while collecting the curriculum — it is a "revise" of that step, whatever verb they use and however tentatively they put it.
			- "clarify": you genuinely cannot tell which of the two it is, or you cannot tell which stored field the user means. Use sparingly.

			When returning "revise", set reviseField to the name of the stored field to change — for example the field holding the course's level, or the one holding its sections. Name the field, not the step; it is looked up.
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
