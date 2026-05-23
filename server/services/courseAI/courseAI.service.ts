import { type CourseGeneration, DraftStep } from "@/generated/prisma";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { courseGenerationMessageRepository } from "@/server/repositories/courseGenerationMessage.repository";
import { traced } from "@/server/services/_shared/tracing";
import { CourseAIError } from "@/server/services/courseAI/courseAI.errors";
import { courseBuilderGraph } from "@/server/services/courseAI/graph/graph";
import {
  isMessageShape,
  type MessageShape,
} from "@/server/services/courseAI/guards/isMessageShape";
import { logger } from "@/server/utils/logger";

const HISTORY_LIMIT = 4;

export class CourseAIService {
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

  private async hydrateState(args: {
    courseGeneration: CourseGeneration;
    userMessage: string;
    mode: "chat" | "finalize";
  }): Promise<Record<string, unknown>> {
    const { courseGeneration: gen, userMessage, mode } = args;

    const lastMessages = await courseGenerationMessageRepository.findMany({
      where: { generationId: gen.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    });

    const history = lastMessages
      .reverse()
      .filter(isMessageShape)
      .map((m) => ({ role: m.role, content: m.content, step: m.step }));

    return {
      generationId: gen.id,
      instructorId: gen.instructorId,
      currentStep: gen.step,
      content: (gen.content as Record<string, unknown>) ?? {},
      history,
      mode,
      userMessage,
      intent: null,
      reviseTarget: null,
      toolCalls: [],
      pendingToolCalls: [],
      assessReady: false,
      draftStepData: undefined,
      confidence: 0,
      shouldAutoAdvance: false,
      assistantText: "",
      validationErrors: null,
    };
  }

  async runChat({
    courseGeneration,
    userMessage,
    signal,
  }: {
    courseGeneration: CourseGeneration;
    userMessage: string;
    signal?: AbortSignal;
  }) {
    const initialState = await this.hydrateState({
      courseGeneration,
      userMessage,
      mode: "chat",
    });
    const run = traced(
      "courseAI.graph",
      async () =>
        courseBuilderGraph.streamEvents(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initialState as any,
          {
            version: "v2",
            signal,
            configurable: { instructorId: courseGeneration.instructorId },
          },
        ),
      {
        feature: "builder",
        userId: courseGeneration.instructorId,
        model: "gpt-4o-mini",
      },
    );
    return run();
  }

  async runFinalize({
    courseGeneration,
    signal,
  }: {
    courseGeneration: CourseGeneration;
    signal?: AbortSignal;
  }) {
    const initialState = await this.hydrateState({
      courseGeneration,
      userMessage: "",
      mode: "finalize",
    });
    const run = traced(
      "courseAI.graph",
      async () =>
        courseBuilderGraph.streamEvents(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initialState as any,
          {
            version: "v2",
            signal,
            configurable: { instructorId: courseGeneration.instructorId },
          },
        ),
      {
        feature: "builder",
        userId: courseGeneration.instructorId,
        model: "gpt-4o-mini",
      },
    );
    return run();
  }
}

export const courseAIService = new CourseAIService();