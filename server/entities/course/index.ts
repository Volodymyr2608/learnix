import { z } from "zod";

export const lessonSchema = z.object({
	title: z.string().min(1),
	duration: z.string().optional(),
	videoUrl: z.string().optional(),
});

export const sectionSchema = z.object({
	title: z.string().min(1),
	lessons: z.array(lessonSchema).min(1),
});

export const courseSchema = z.object({
	title: z.string().min(3),
	subtitle: z.string().optional(),
	description: z.string().min(10),
	category: z.string().min(1),
	level: z.string().min(1),
	language: z.string().min(1),
	duration: z.string().min(1),
	price: z.string().min(1),
	originalPrice: z.string().optional(),
	objectives: z.array(z.string().min(1)).min(4),
	requirements: z.array(z.string().min(1)).min(2),
	sections: z.array(sectionSchema).min(1),

	thumbnailFile: z.any().optional(),
	previewVideoFile: z.any().optional(),

	status: z.enum(["draft", "published"]).default("draft"),
});

export type CourseForm = z.infer<typeof courseSchema>;
