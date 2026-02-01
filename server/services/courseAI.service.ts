import { ChatOpenAI } from "@langchain/openai";
import { type CourseGeneration, DraftStep } from "@/generated/prisma";
import { courseGenerationRepository } from "@/server/repositories/courseGenerationRepository";
import { logger } from "@/server/utils/logger";
import { isMessageShape, type MessageShape } from "./guards/isMessageShape";
import { extractStepDataPrompt } from "./prompts/extractStepDataPrompt";
import { buildSystemPrompt } from "./prompts/systemPrompt";
import { getValidatorForStep } from "./validators/getValidatorForStep";

export class CourseAIService {
	private readonly apiKey = process.env.OPENAI_API_KEY;

	private getModel() {
		return new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0.4,
			apiKey: this.apiKey,
		});
	}

	async getOrCreateCourseGeneration({
		courseGenerationId,
		userId,
	}: {
		courseGenerationId?: string;
		userId: string;
	}) {
		try {
			if (courseGenerationId) {
				const existing = await courseGenerationRepository.findFirst({
					where: { id: courseGenerationId, instructorId: userId },
				});

				if (existing) return existing;
			}

			return courseGenerationRepository.create({
				instructorId: userId,
				step: DraftStep.basic,
				content: {},
				chatHistory: [],
			});
		} catch (error) {
			logger.error(error);
			throw new Error("[Course AI service] failed to create course generation");
		}
	}

	async saveMessage(id: string, message: MessageShape) {
		try {
			const entity = await courseGenerationRepository.findOne(id);
			const updatedChatHistory = [...(entity.chatHistory || []), message];

			return await courseGenerationRepository.update(id, {
				chatHistory: updatedChatHistory,
			});
		} catch (e) {
			logger.error(e);
			throw new Error("[Course AI service] Error saving message");
		}
	}

	async *streamChatResponse({
		courseGeneration,
		userMessage,
		signal,
	}: {
		courseGeneration: CourseGeneration;
		userMessage: string;
		signal?: AbortSignal;
	}) {
		const model = this.getModel();

		if (signal?.aborted) return;

		const systemPrompt = buildSystemPrompt({
			step: courseGeneration.step,
			currentCourseData: courseGeneration.content as Record<string, unknown>,
		});

		const chatHistoryData = Array.isArray(courseGeneration.chatHistory)
			? courseGeneration.chatHistory
			: [];

		const history: MessageShape[] = chatHistoryData
			.filter(isMessageShape)
			.slice(-6)
			.map((msg) => ({
				role: msg.role,
				content: msg.content,
			}));

		const messages = [
			{ role: "system", content: systemPrompt },
			...history,
			{ role: "user", content: userMessage },
		];

		try {
			const stream = await model.stream(messages, { signal });

			for await (const chunk of stream) {
				if (signal?.aborted) return;

				const token = chunk.content?.toString();

				if (token) {
					yield { type: "token", value: token };
				}
			}

			if (!signal?.aborted) {
				yield {
					type: "actions",
					currentStep: courseGeneration.step,
				};
			}
		} catch (error) {
			if (signal?.aborted) return;

			logger.error("STREAM_CHAT_ERROR", error);
			yield { type: "error", message: "Something went wrong" };
		}
	}

	async extractStepData(courseGen: CourseGeneration) {
		try {
			const model = new ChatOpenAI({
				model: "gpt-4o-mini",
				temperature: 0,
				modelKwargs: { response_format: { type: "json_object" } },
			});

			const step = courseGen.step;
			const history = JSON.stringify(courseGen.chatHistory.slice(-3));

			const systemPrompt = extractStepDataPrompt({ step, history });

			const response = await model.invoke([
				{ role: "system", content: systemPrompt },
			]);
			const rawJson = JSON.parse(response.content.toString());

			const stepValidator = getValidatorForStep(step);

			return stepValidator.parse(rawJson);
		} catch (error) {
			logger.error(error);
			throw new Error("[Course AI service] failed to extract step data");
		}
	}
}

export const courseAIService = new CourseAIService();
