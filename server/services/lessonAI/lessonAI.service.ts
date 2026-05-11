import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { lessonAssistantRepository } from "@/server/repositories/lessonAssistant.repository";
import { traced } from "@/server/services/_shared/tracing";
import { buildTopicGuardChain } from "./chains/topicGuard.chain";
import { createLessonAgent } from "./lessonAI.agent";
import { LessonAIError, OffTopicError } from "./lessonAI.errors";

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

		// Layer 1: topic guardrail
		try {
			const guard = buildTopicGuardChain(lessonTitle);
			await guard.invoke({ userMessage });
		} catch (err) {
			if (err instanceof OffTopicError) {
				yield { type: "token" as const, value: err.message };
				return;
			}
			throw new LessonAIError(
				"Guardrail chain failed",
				"INTERNAL_SERVER_ERROR",
				err,
			);
		}

		if (signal?.aborted) return;

		// Load conversation history
		const history = await lessonAssistantRepository.getMessages(
			lessonId,
			studentId,
		);
		const langchainHistory = history.flatMap((msg) =>
			msg.role === "user"
				? [new HumanMessage(msg.content)]
				: [new AIMessage(msg.content)],
		);

		// Layer 2: ReAct agent
		const agent = createLessonAgent({
			lessonId,
			lessonTitle,
			courseTitle,
			studentId,
			courseId,
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

		try {
			const stream = await tracedStream();

			for await (const event of stream) {
				if (signal?.aborted) return;

				if (
					event.event === "on_chat_model_stream" &&
					event.metadata?.langgraph_node === "agent"
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
			}
		} catch (_error) {
			if (signal?.aborted) return;
			yield { type: "error" as const, message: "Something went wrong" };
			return;
		}

		// Layer 3: persist assistant reply
		if (fullReply) {
			await lessonAssistantRepository.saveMessage(lessonId, studentId, {
				role: "assistant",
				content: fullReply,
				toolCalls: toolCallsSummary.length > 0 ? toolCallsSummary : undefined,
			});
		}
	}
}

export const lessonAIService = new LessonAIService();
