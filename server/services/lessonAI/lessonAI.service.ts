import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { lessonAssistantRepository } from "@/server/repositories/lessonAssistant.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { traced } from "@/server/services/_shared/tracing";
import { createLessonAgent } from "./lessonAI.agent";

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
			lessonAssistantRepository.getMessages(lessonId, studentId),
			lessonInsightsRepository.findByLessonId(lessonId),
		]);
		const lessonConcepts =
			(lessonInsights?.concepts as { name: string }[] | null)?.map(
				(c) => c.name,
			) ?? [];

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
			}
		} catch (_error) {
			if (signal?.aborted) return;
			yield { type: "error" as const, message: "Something went wrong" };
			return;
		}

		// Layer 2: persist assistant reply
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
