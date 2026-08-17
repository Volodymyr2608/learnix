import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { lessonAssistantRepository } from "@/server/repositories/lessonAssistant.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import { traced } from "@/server/services/_shared/tracing";
import { logger } from "@/server/utils/logger";
import { createLessonAgent } from "./lessonAI.agent";
import type { ReplyValidationResult } from "./types";
import { validateReply } from "./validateReply";

/**
 * `StreamEvent.data` is typed `any`, and a tool result arrives either as the raw
 * string the tool returned or wrapped in a ToolMessage. Both shapes are pinned
 * by lessonAI.service.test.ts.
 */
const toolOutputText = (output: unknown): string => {
	if (typeof output === "string") return output;
	if (
		typeof output === "object" &&
		output !== null &&
		"content" in output &&
		typeof (output as { content: unknown }).content === "string"
	) {
		return (output as { content: string }).content;
	}
	return "";
};

/**
 * One tutor request is not one model call: L2, the router pass, each tool, then
 * the answer. LangGraph's default ceiling is 25; 12 covers the four tools plus
 * retries and makes the per-request cost a decision rather than a default.
 * Exceeding it throws, which the stream's catch turns into the standard neutral
 * error — the student never sees a stack trace.
 */
const AGENT_RECURSION_LIMIT = 12;

export class LessonAIService {
	async *streamResponse(params: {
		lessonId: string;
		lessonTitle: string;
		courseTitle: string;
		courseId: string;
		studentId: string;
		userMessage: string;
		signal?: AbortSignal;
	}) {
		const {
			lessonId,
			lessonTitle,
			courseTitle,
			courseId,
			studentId,
			userMessage,
			signal,
		} = params;

		// Load conversation history and lesson concept list in parallel
		const [history, lessonInsights] = await Promise.all([
			lessonAssistantRepository.getContextMessages(lessonId, studentId),
			lessonInsightsRepository.findByLessonId(lessonId),
		]);

		// Persist the user turn AFTER the context read, not before. getContextMessages
		// returns the newest eligible rows, so saving first puts this very turn into
		// its own replayed history — and it is appended again below as the current
		// message. courseAI's route carries the same note for the same reason.
		const userRow = await lessonAssistantRepository.saveMessage(
			lessonId,
			studentId,
			{ role: "user", content: userMessage },
		);
		// LLM-generated JSON with no schema behind it, and this becomes the
		// toolPolicy allowlist — a non-string entry would throw inside the policy's
		// trim(), turning a denial into an unhandled error.
		const lessonConcepts = (
			(lessonInsights?.concepts as { name?: unknown }[] | null) ?? []
		)
			.map((concept) => concept?.name)
			.filter(
				(name): name is string => typeof name === "string" && name.length > 0,
			);

		const langchainHistory = history.map((msg) =>
			msg.role === "user"
				? new HumanMessage(msg.content)
				: new AIMessage(msg.content),
		);

		// Layer 1: ReAct agent
		const agent = createLessonAgent({
			lessonId,
			lessonTitle,
			courseTitle,
			studentId,
			courseId,
			lessonConcepts,
		});

		const tracedStream = traced(
			"lessonAI.streamResponse",
			async () =>
				agent.streamEvents(
					{ messages: [...langchainHistory, new HumanMessage(userMessage)] },
					{
						version: "v2",
						signal,
						recursionLimit: AGENT_RECURSION_LIMIT,
					},
				),
			{ feature: "tutor", userId: studentId, courseId },
		);

		let fullReply = "";
		const toolCallsSummary: Array<{ tool: string; input: unknown }> = [];
		const retrievedContent: string[] = [];
		// Tracks whether a mark_concept_understood call actually committed this
		// turn (vs. being denied by toolPolicy, which returns the neutral refusal
		// and writes nothing). Used only to correlate a retained write with a
		// retracted reply — never to claim a write that never landed.
		let masteryCommitted = false;

		// The output boundary, callable from every exit. validateReply emits its own
		// output_validation_failed via reject(), so this must not log that outcome a
		// second time — it only handles the validator itself throwing.
		const runOutputBoundary = (): ReplyValidationResult => {
			try {
				return validateReply(fullReply, {
					userId: studentId,
					retrievedContent,
				});
			} catch {
				logSecurityEvent({
					feature: "lessonAI",
					userId: studentId,
					layer: "output_validation",
					outcome: "output_validation_failed",
					ruleIds: ["validator_error"],
					score: 0,
				});
				return { valid: false, ruleId: "validator_error" };
			}
		};

		// Flips the eliciting prompt out of model context. Never allowed to abort the
		// turn: it is bookkeeping, and letting it throw would take the security event
		// and the retraction down with it — reintroducing, one line later, exactly the
		// "control the adversary can decline to trigger" that this work removed.
		const retireRejectedPrompt = async () => {
			try {
				await lessonAssistantRepository.markContextIneligible(
					userRow.id,
					lessonId,
					studentId,
				);
			} catch (error) {
				logger.error(error, "[lessonAI] context-ineligible flip failed");
			}
		};

		// Shared by the abort and mid-stream-error exits: the client is gone or the
		// turn failed, so there is nothing to retract and nothing to persist — but a
		// reply that already reached the browser must still produce its security
		// events. Without this, disconnecting after the last token is a detection
		// bypass, and S13 §2 accepts the streaming disclosure precisely because
		// output_validation_failed stays queryable.
		//
		// Idempotent, because it is reachable from the abort exit, the catch, and the
		// finally that covers consumer abandonment — and `output_validation_failed`
		// is thresholded on "any occurrence", so double-counting is a real defect.
		let boundaryRun = false;
		const finishWithoutDelivery = async () => {
			if (boundaryRun || !fullReply) return;
			boundaryRun = true;
			const validation = runOutputBoundary();
			if (validation.valid) return;
			// Emitted BEFORE the write, not after: this is the zero-baseline signal
			// that S13 §24 traded against, so it must not sit behind anything fallible.
			if (masteryCommitted) {
				logSecurityEvent({
					feature: "lessonAI",
					userId: studentId,
					layer: "output_validation",
					outcome: "mastery_write_retained",
					ruleIds: [validation.ruleId],
					score: 0,
				});
			}
			await retireRejectedPrompt();
		};

		try {
			const stream = await tracedStream();

			for await (const event of stream) {
				if (signal?.aborted) {
					await finishWithoutDelivery();
					return;
				}

				if (
					event.event === "on_chat_model_stream" &&
					event.metadata?.langgraph_node === "model_request"
				) {
					const token =
						typeof event.data?.chunk?.content === "string"
							? event.data.chunk.content
							: "";
					if (token) {
						fullReply += token;
						yield { type: "token" as const, value: token };
					}
				}

				if (event.event === "on_tool_start") {
					toolCallsSummary.push({
						tool: event.name ?? "unknown",
						input: event.data?.input,
					});
				}

				if (event.event === "on_tool_end") {
					const text = toolOutputText(event.data?.output);
					if (text) retrievedContent.push(text);
					// Read the commit from the tool's artifact, never from its prose.
					// The prose is a user-facing string shared with two other refusal
					// paths; rewording it is a product change nobody would expect to
					// touch telemetry, and this signal's baseline is zero.
					if (event.name === "mark_concept_understood") {
						const artifact = (
							event.data?.output as
								| { artifact?: { committed?: boolean } }
								| undefined
						)?.artifact;
						if (artifact?.committed === true) masteryCommitted = true;
					}
				}
			}
		} catch (_error) {
			// A mid-stream provider error is the third exit that used to skip the
			// output boundary with a partial reply already in the browser.
			await finishWithoutDelivery();
			if (signal?.aborted) return;
			yield { type: "error" as const, message: "Something went wrong" };
			return;
		} finally {
			// The consumer can abandon this generator instead of driving it to the
			// abort check above: the route breaks its `for await` the moment the
			// signal trips, and `break` calls generator.return(), which unwinds the
			// body from the suspended `yield` — skipping every statement inside the
			// loop. `finally` is the only construct that survives that, so it is what
			// actually closes the abort bypass. The in-loop call remains for the case
			// where the service notices first; finishWithoutDelivery is idempotent.
			if (signal?.aborted) await finishWithoutDelivery();
		}

		// An abort that lands after the last stream event never reaches the in-loop
		// check, so without this the turn would take the completion path and persist
		// an assistant row for a client that is already gone.
		if (signal?.aborted) {
			await finishWithoutDelivery();
			return;
		}

		// Layer 2: validate the assembled reply, then persist
		if (!fullReply) return;

		// Fail-closed. A validator that throws is a rejection, not a pass.
		const validation = runOutputBoundary();
		boundaryRun = true;

		if (!validation.valid) {
			// Retract rather than persist: the tokens already left, but nothing
			// enters the thread or the model's future context. The mastery write
			// from this turn (if any) stands — it passed its own authorization
			// and is not coupled to the reply text. When one did commit, correlate
			// the retained side effect with the retraction so a human can review a
			// turn that was adversarial enough to be retracted yet still wrote to
			// an educational record (S13 §24).
			//
			// The prompt that elicited the rejected reply leaves the model's context
			// too: re-sending it otherwise hands the payload another sample of a
			// stochastic model, with the previous attempt replayed as ordinary
			// conversation. The turn stays visible in the thread.
			//
			// Event first, then the write, then the retraction — the write is the only
			// fallible step here, and neither the signal nor the refusal may depend on
			// it succeeding.
			if (masteryCommitted) {
				logSecurityEvent({
					feature: "lessonAI",
					userId: studentId,
					layer: "output_validation",
					outcome: "mastery_write_retained",
					ruleIds: [validation.ruleId],
					score: 0,
				});
			}
			await retireRejectedPrompt();
			yield { type: "retract" as const, message: NEUTRAL_REFUSAL_MESSAGE };
			return;
		}

		await lessonAssistantRepository.saveMessage(lessonId, studentId, {
			role: "assistant",
			content: fullReply,
			toolCalls: toolCallsSummary.length > 0 ? toolCallsSummary : undefined,
		});
	}
}

export const lessonAIService = new LessonAIService();
