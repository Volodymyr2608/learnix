import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { lessonAssistantRepository } from "@/server/repositories/lessonAssistant.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import { traced } from "@/server/services/_shared/tracing";
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
					{ version: "v2", signal },
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

		try {
			const stream = await tracedStream();

			for await (const event of stream) {
				if (signal?.aborted) return;

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
					// A commit is any output from the write tool other than the
					// neutral refusal toolPolicy returns on denial.
					if (
						event.name === "mark_concept_understood" &&
						text !== "" &&
						text !== NEUTRAL_REFUSAL_MESSAGE
					) {
						masteryCommitted = true;
					}
				}
			}
		} catch (_error) {
			if (signal?.aborted) return;
			yield { type: "error" as const, message: "Something went wrong" };
			return;
		}

		// Layer 2: validate the assembled reply, then persist
		if (!fullReply) return;

		// Fail-closed. A validator that throws is a rejection, not a pass.
		let validation: ReplyValidationResult;
		try {
			validation = validateReply(fullReply, {
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
			validation = { valid: false, ruleId: "validator_error" };
		}

		if (!validation.valid) {
			// Retract rather than persist: the tokens already left, but nothing
			// enters the thread or the model's future context. The mastery write
			// from this turn (if any) stands — it passed its own authorization
			// and is not coupled to the reply text. When one did commit, correlate
			// the retained side effect with the retraction so a human can review a
			// turn that was adversarial enough to be retracted yet still wrote to
			// an educational record (S13 §24).
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
