import { z } from "zod";
import { hasSafeScheme, isAllowedVideoUrl } from "@/lib/url";

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
	durationMinutes: z.number().int().min(0).nullable().optional(),
	videoUrl: z
		.string()
		.max(2048)
		// "" must stay valid: lesson.service.ts writes `dto.videoUrl ?? null`, and
		// the form clears the field by submitting an empty string. A bare refine
		// here would break clearing a video.
		.refine((u) => u === "" || isAllowedVideoUrl(u), "Unsupported video host")
		.nullable()
		.optional(),
	content: z.string().nullable().optional(),
	resources: z
		.array(
			z.object({
				id: z.string(),
				name: z.string(),
				type: z.string(),
				// hasSafeScheme, not !isOffOrigin: a javascript: URL classifies as
				// "drop" rather than "off_origin", so a negated off-origin check
				// accepts every dangerous scheme and constrains only the http(s)
				// URLs that were fine anyway.
				url: z
					.string()
					.max(2048)
					.refine(hasSafeScheme, "Unsupported URL scheme"),
			}),
		)
		.optional(),
	quizzes: z.array(QuizUpsertDto).optional(),
});

export type LessonContentUpdateDto = z.infer<typeof LessonContentUpdateDto>;
