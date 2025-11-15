import type { z } from "zod";
import { CourseSchema, LessonSchema, SectionSchema } from "@/prisma/zod";

const LessonCreateDto = LessonSchema.pick({
	title: true,
	duration: true,
	sectionId: true,
});

export type LessonCreateDto = z.infer<typeof LessonCreateDto>;

const SectionCreateDto = SectionSchema.pick({
	title: true,
	courseId: true,
	order: true,
});

export type SectionCreateDto = z.infer<typeof SectionCreateDto>;

export const CreateCourseDto = CourseSchema.pick({
	title: true,
	subtitle: true,
	description: true,
	category: true,
	level: true,
	language: true,
	duration: true,
	price: true,
	originalPrice: true,
	objectives: true,
	requirements: true,
	sections: true,
	status: true,
	thumbnailUrl: true,
	previewVideoUrl: true,
	instructorId: true,
});

export type CreateCourseDto = z.infer<typeof CreateCourseDto>;
