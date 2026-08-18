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
				id: z.string().max(64),
				// Rendered to every enrolled student; bounded so a single lesson
				// update cannot store megabytes of instructor-authored label text.
				name: z.string().max(200),
				type: z.string().max(32),
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
		.max(50)
		.optional(),
	quizzes: z.array(QuizUpsertDto).optional(),
});

export type LessonContentUpdateDto = z.infer<typeof LessonContentUpdateDto>;
