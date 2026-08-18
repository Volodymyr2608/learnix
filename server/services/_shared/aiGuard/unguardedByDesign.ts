import type { ZodType } from "zod";
import { LessonInsightsSchema } from "@/prisma/zod";
import { LearningPathCourseDto } from "@/server/entities/learningPath";
import { QuizGenerateAIDto } from "@/server/entities/quiz";
import type { AiFeature } from "./types";

export type UnguardedSurface = {
	feature: AiFeature;
	/** Why no L1/L2 input guard runs on this surface. */
	reason: string;
	/** Everything the caller controls, in full. */
	input: ZodType;
	/** Where that input is declared, for a reader checking the claim. */
	inputDeclaredAt: string;
};

/**
 * The surfaces that run no input guard, and the reason each one does not need
 * to. The claim is always the same shape: the caller supplies ids and numbers,
 * never prose, so there is no user-authored text for L1/L2 to inspect. The
 * untrusted text on these surfaces arrives from the database instead, which is
 * what L3 (wrapping) and L5 (the output boundary) are for.
 *
 * The claim is only as true as the DTOs, so `unguardedByDesign.contract.test.ts`
 * re-derives it from the schemas rather than trusting this list. Adding a
 * free-text field to any of them fails CI.
 */
export const UNGUARDED_BY_DESIGN: UnguardedSurface[] = [
	{
		feature: "quizAI",
		reason:
			"An instructor asks for N questions on a lesson they own. The input is a lesson id, a bounded count and a boolean; the lesson body it reads is wrapped, not guarded.",
		input: QuizGenerateAIDto,
		inputDeclaredAt: "server/entities/quiz/index.ts",
	},
	{
		feature: "lessonInsightsAI",
		reason:
			"The whole input is one lesson id. The lesson content that reaches the model is instructor-authored text read from the database and wrapped by the service.",
		input: LessonInsightsSchema.shape.lessonId,
		inputDeclaredAt: "prisma/zod (LessonInsightsSchema.shape.lessonId)",
	},
	{
		feature: "learningPathAI",
		reason:
			"A student asks for their next steps in one course. The input is that course id; every other value in the prompt is read from their own progress records.",
		input: LearningPathCourseDto,
		inputDeclaredAt: "server/entities/learningPath/index.ts",
	},
];
