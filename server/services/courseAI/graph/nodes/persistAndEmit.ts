import type { Prisma } from "@/generated/prisma";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { courseGenerationMessageRepository } from "@/server/repositories/courseGenerationMessage.repository";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import { STEP_MESSAGES } from "@/lib/constants/stepMessages";

export const persistAndEmit = withNodeErrors(
  "persist_and_emit",
  async (state: CourseBuilderStateT) => {
    const draft = state.draftStepData as Prisma.JsonObject;

    await courseGenerationRepository.transaction(async () => {
      const updated = await courseGenerationRepository.updateContent(
        state.generationId,
        state.currentStep,
        draft,
      );

      const nextStepId = updated.step;
      const flowText =
        STEP_MESSAGES[nextStepId] ?? "Let's continue building your course.";

      await courseGenerationMessageRepository.create({
        generationId: state.generationId,
        step: nextStepId,
        role: "assistant",
        content: flowText,
      });
    });

    return {};
  },
);