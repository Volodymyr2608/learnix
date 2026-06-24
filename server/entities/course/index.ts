import { z } from "zod";
import type { Course } from "@/generated/prisma";
import type { CourseWithRelations } from "@/prisma/zod";
import {
	CourseGenerationMessageSchema,
	CourseGenerationSchema,
	CourseSchema,
	LessonSchema,
	QuizSchema,
	SectionSchema,
} from "@/prisma/zod";
import type { Merge } from "@/server/types/merge";

const lessonSchema = z
	.array(
		z.object({
			id: z.string().optional(),
			title: z.string().min(1, "Lesson title is required"),
			durationMinutes: z.number().int().min(0).nullable().optional(),
		}),
	)
	.min(1, "At least 1 lesson is required per section");

const sectionsSchema = z
	.array(
		z.object({
			id: z.string().optional(),
			title: z.string().min(1, "Section title is required"),
			order: z.number(),

			lessons: lessonSchema,
		}),
	)
	.min(1, "At least 1 section is required");

export const courseSchema = z.object({
	title: z
		.string()
		.min(3, "Title must be at least 3 characters")
		.max(60, "Title must be less than 60 characters"),
	subtitle: z.string().nullable().optional(),
	description: z
		.string()
		.min(10, "Description must be at least 10 characters")
		.max(500, "Description must be less than 500 characters"),
	category: z.string().min(1, "Category is mandatory"),
	level: z.string().min(1, "Level is mandatory"),
	language: z.string().min(1, "Language is mandatory"),
	duration: z.string().min(1, "Duration is mandatory"),
	priceCents: z
		.number()
		.min(0, "Price must be 0 or greater")
		.transform((dollars) => Math.round(dollars * 100)),
	originalPriceCents: z
		.number()
		.min(0)
		.nullable()
		.optional()
		.transform((v) => (v != null ? Math.round(v * 100) : v)),
	thumbnail: z
		.preprocess(
			(val) => {
				if (val === undefined || val === "") return undefined;
				return val;
			},
			z.union([
				z
					.instanceof(File)
					.refine((file) => file.type.startsWith("image/"), {
						message: "Thumbnail must be an image file",
					})
					.refine((file) => file.size <= 2 * 1024 * 1024, {
						message: "Thumbnail must be smaller than 2MB",
					}),
				z.url(),
				z.undefined(),
			]),
		)
		.refine((val) => val !== undefined, {
			message: "Thumbnail is required",
		}),

	previewVideo: z
		.instanceof(File)
		.optional()
		.nullable()
		.refine((file) => !file || file.type.startsWith("video/"), {
			message: "Preview must be a video file",
		})
		.refine((file) => !file || file.size <= 100 * 1024 * 1024, {
			message: "Video must be smaller than 100MB",
		}),
	objectives: z
		.array(
			z.object({
				value: z.string().min(1, "Objective cannot be empty"),
			}),
		)
		.min(4, "At least 4 learning objectives are required"),
	requirements: z
		.array(
			z.object({
				value: z.string().min(1, "Requirement cannot be empty"),
			}),
		)
		.min(2, "At least 2 requirements are required"),
	sections: sectionsSchema,
	skills: z.array(z.string()).default([]),
});

export type CourseSchemaInput = z.input<typeof courseSchema>;
export type CourseSchemaOutput = z.output<typeof courseSchema>;

export const CourseDto = CourseSchema.pick({
	title: true,
	subtitle: true,
	description: true,
	category: true,
	level: true,
	language: true,
	duration: true,
	priceCents: true,
	originalPriceCents: true,
	objectives: true,
	requirements: true,
	status: true,
	thumbnailUrl: true,
	previewVideoUrl: true,
	instructorId: true,
}).extend({
	skills: z.array(z.string()).default([]),
});

const SectionCreateDto = SectionSchema.pick({
	title: true,
	courseId: true,
	order: true,
});

const SectionUpdateDto = SectionCreateDto.omit({
	courseId: true,
});

export type SectionCreateDto = z.infer<typeof SectionCreateDto>;
export type SectionUpdateDto = z.infer<typeof SectionUpdateDto>;

const LessonCreateDto = LessonSchema.pick({
	title: true,
	durationMinutes: true,
	sectionId: true,
	order: true,
});

const LessonUpdateDto = LessonCreateDto.omit({
	sectionId: true,
});

export type LessonCreateDto = z.infer<typeof LessonCreateDto>;
export type LessonUpdateDto = z.infer<typeof LessonUpdateDto>;

const QuizCreateDto = QuizSchema.pick({
	question: true,
	correct: true,
	lessonId: true,
	options: true,
});

export type QuizCreateDto = z.infer<typeof QuizCreateDto>;
export type QuizUpdateDto = z.infer<typeof QuizCreateDto>;

export const CourseFullCreateDto = CourseDto.extend({
	sections: sectionsSchema,
});

export type CourseFullCreateDto = z.infer<typeof CourseFullCreateDto>;

export const CourseFullUpdateDto = CourseFullCreateDto.extend({
	id: z.string(),
});

export type CourseFullUpdateDto = z.infer<typeof CourseFullUpdateDto>;

export type CourseCreateDto = z.infer<typeof CourseDto>;
export type CourseUpdateDto = z.infer<typeof CourseDto> & {
	id: Course["id"];
	deletedAt?: Course["deletedAt"];
};

export type FullCourse = CourseWithRelations;

export type OwnCoursePreview = FullCourse & {
	_count: { enrollments: number };
};

export type CourseWithSections = Merge<
	Course,
	{ sections: CourseWithRelations["sections"] }
>;

export const processStepSchema = z.object({
	courseGenerationId: z.string(),
});

export const UpdateCourseGenerationStatusSchema = CourseGenerationSchema.pick({
	id: true,
	status: true,
});

const CourseGenerationCreateShema = CourseGenerationSchema.pick({
	instructorId: true,
	step: true,
	content: true,
	status: true,
});

const CourseGenerationUpdateShema = CourseGenerationCreateShema.extend({});

export type CourseGenerationCreateDto = z.infer<
	typeof CourseGenerationCreateShema
>;
export type CourseGenerationUpdateDto = Partial<
	z.infer<typeof CourseGenerationUpdateShema>
>;

const CourseGenerationMessageCreateShema = CourseGenerationMessageSchema.pick({
	generationId: true,
	step: true,
	content: true,
	role: true,
});

const CourseGenerationMessageUpdateShema = CourseGenerationCreateShema.extend(
	{},
);

export type CourseGenerationMessageCreateDto = z.infer<
	typeof CourseGenerationMessageCreateShema
>;

export type CourseGenerationMessageUpdateDto = Partial<
	z.infer<typeof CourseGenerationMessageUpdateShema>
>;
