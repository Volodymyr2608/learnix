import { z } from "zod";
import { QuizSchema } from "@/prisma/zod";

export const QuizSubmitDto = z.object({
	quizId: QuizSchema.shape.id,
	selectedAnswer: z.string().min(1),
});

export type QuizSubmitDto = z.infer<typeof QuizSubmitDto>;

export const QuizItemDto = z.object({
	question: z.string().min(1, "Question is required"),
	options: z.array(z.string().min(1)).length(4, "Exactly 4 options required"),
	correct: z.string().min(1, "Correct answer is required"),
	/**
	 * Echoed back from generation, never authored in the form. Accepted here only
	 * so the tag survives the round trip; `upsertMany` resolves it against the
	 * lesson's allowlist again, so what arrives is a proposal, not a decision.
	 *
	 * Nullish, because both spellings of "untagged" reach here: the generator
	 * returns `null` (its schema is strict — see quizOutput.schema.ts) and
	 * `retagWithAllowlist` drops the key outright.
	 */
	concept: z.string().max(200).nullish(),
});

export type QuizItemDto = z.infer<typeof QuizItemDto>;

export const QuizUpsertManyDto = z.object({
	lessonId: QuizSchema.shape.lessonId,
	questions: z.array(QuizItemDto),
});

export type QuizUpsertManyDto = z.infer<typeof QuizUpsertManyDto>;

export const QuizGenerateAIDto = z.object({
	lessonId: QuizSchema.shape.lessonId,
	count: z.number().int().min(3).max(5).default(3),
	regenerate: z.boolean().default(false),
});

export type QuizGenerateAIDto = z.infer<typeof QuizGenerateAIDto>;
