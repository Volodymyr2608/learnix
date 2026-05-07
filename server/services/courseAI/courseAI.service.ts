import { ChatOpenAI } from "@langchain/openai";
import { TRPCError } from "@trpc/server";
import { type CourseGeneration, DraftStep } from "@/generated/prisma";
import { STEP_MESSAGES } from "@/lib/constants/stepMessages";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { courseGenerationMessageRepository } from "@/server/repositories/courseGenerationMessage.repository";
import { CourseAIError } from "@/server/services/courseAI/courseAI.errors";
import {
	isMessageShape,
	type MessageShape,
} from "@/server/services/courseAI/guards/isMessageShape";
import { extractStepDataPrompt } from "@/server/services/courseAI/prompts/extractStepDataPrompt";
import { buildSystemPrompt } from "@/server/services/courseAI/prompts/systemPrompt";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";
import { logger } from "@/server/utils/logger";
import {env} from "@/lib/env";

export class CourseAIService {
	private readonly apiKey = env.OPENAI_API_KEY;

	private getModel() {
		return new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0.4,
			apiKey: this.apiKey,
		});
	}

	private async getLastMessages(courseGenerationId: string) {
		const lastMessages = await courseGenerationMessageRepository.findMany({
			where: { generationId: courseGenerationId },
			orderBy: { createdAt: "desc" },
			take: 4,
		});

		return lastMessages
			.reverse()
			.filter(isMessageShape)
			.map((msg) => ({
				role: msg.role,
				content: msg.content,
				step: msg.step,
			}));
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
				status: "active",
			});
		} catch (error) {
			logger.error(error);
			throw new CourseAIError(
				"[Course AI service] failed to create course generation",
			);
		}
	}

	async saveMessage(generationId: string, message: MessageShape) {
		try {
			return await courseGenerationMessageRepository.create({
				generationId,
				role: message.role,
				content: message.content,
				step: message.step,
			});
		} catch (e) {
			logger.error(e);
			throw new CourseAIError("[Course AI service] Error saving message");
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

		const history = await this.getLastMessages(courseGeneration.id);

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

	async extractStepData(courseGeneration: CourseGeneration) {
		try {
			const model = new ChatOpenAI({
				model: "gpt-4o-mini",
				temperature: 0,
				modelKwargs: { response_format: { type: "json_object" } },
			});

			const step = courseGeneration.step;
			const lastMessages = await this.getLastMessages(courseGeneration.id);

			const history = lastMessages
				.map((msg) => `[${msg.role}]: ${msg.content}`)
				.join("\n");

			const systemPrompt = extractStepDataPrompt({ step, history });

			const response = await model.invoke([
				{ role: "system", content: systemPrompt },
			]);
			const rawJson = JSON.parse(response.content.toString());

			const stepValidator = getValidatorForStep(step);

			return stepValidator.parse(rawJson);
		} catch (error) {
			logger.error(error);
			throw new CourseAIError(
				"[Course AI service] failed to extract step data",
			);
		}
	}

	async acceptStep(params: { userId: string; courseGenerationId: string }) {
		const { userId, courseGenerationId } = params;

		const courseGen = await this.getOrCreateCourseGeneration({
			courseGenerationId,
			userId,
		});

		if (!courseGen) throw new TRPCError({ code: "NOT_FOUND" });

		const extractedData = await this.extractStepData(courseGen);

		const updated = await courseGenerationRepository.transaction(async () => {
			const updatedGen = await courseGenerationRepository.updateContent(
				courseGenerationId,
				courseGen.step,
				extractedData,
			);

			const nextStepId = updatedGen.step;
			const flowText =
				STEP_MESSAGES[nextStepId] ?? "Let's continue building your course.";

			await courseGenerationMessageRepository.create({
				generationId: courseGenerationId,
				step: nextStepId,
				role: "assistant",
				content: flowText,
			});

			return updatedGen;
		});

		return {
			step: updated.step,
			data: extractedData,
		};
	}
}

export const courseAIService = new CourseAIService();
