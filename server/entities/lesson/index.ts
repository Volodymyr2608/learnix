import { z } from "zod";

const QuizUpsertDto = z
	.object({
		id: z.string().optional(),
		question: z.string().min(1, "Question is required"),
		options: z.array(z.string()).min(2, "At least 2 options required"),
		correctAnswer: z.number().int().min(0),
	})
	.refine((data) => data.correctAnswer < data.options.length, {
		message: "Correct answer index must be within options range",
	});

export const LessonContentUpdateDto = z.object({
	id: z.string(),
	title: z.string().min(1, "Title is required"),
	description: z.string().nullable().optional(),
	duration: z.string().nullable().optional(),
	videoUrl: z.string().nullable().optional(),
	content: z.string().nullable().optional(),
	resources: z
		.array(
			z.object({
				id: z.string(),
				name: z.string(),
				type: z.string(),
				url: z.string(),
			}),
		)
		.optional(),
	quizzes: z.array(QuizUpsertDto).optional(),
});

export type LessonContentUpdateDto = z.infer<typeof LessonContentUpdateDto>;
