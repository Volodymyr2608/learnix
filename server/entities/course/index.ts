import { z } from "zod";
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

export const courseSchema = z.object({
	title: z
		.string()
		.min(3, "Title must be at least 3 characters")
		.max(50, "Title must be less than 50 characters"),
	subtitle: z.string().optional(),
	description: z
		.string()
		.min(10, "Description must be at least 10 characters")
		.max(200, "Description must be less than 200 characters"),
	category: z.string().min(1, "Category is mandatory"),
	level: z.string().min(1, "Level is mandatory"),
	language: z.string().min(1, "Language is mandatory"),
	duration: z.string().min(1, "Duration is mandatory"),
	price: z.string().min(1, "Price is mandatory"),
	originalPrice: z.string().optional(),
	thumbnail: z
		.instanceof(File, { message: "Thumbnail is required" })
		.refine((file) => file.type.startsWith("image/"), {
			message: "Thumbnail must be an image file",
		})
		.refine((file) => file.size <= 2 * 1024 * 1024, {
			message: "Thumbnail must be smaller than 2MB",
		}),

	previewVideo: z
		.instanceof(File)
		.optional()
		.refine((file) => !file || file.type.startsWith("video/"), {
			message: "Preview must be a video file",
		})
		.refine((file) => !file || file.size <= 100 * 1024 * 1024, {
			message: "Video must be smaller than 100MB",
		}),
});

export const CreateCourseDto = CourseSchema.pick({
	title: true,
	// subtitle: true,
	// description: true,
	category: true,
	// level: true,
	// language: true,
	// duration: true,
	// price: true,
	// originalPrice: true,
	// objectives: true,
	// requirements: true,
	// status: true,
	// thumbnailUrl: true,
	// previewVideoUrl: true,
	// instructorId: true,
});

export type CreateCourseDto = z.infer<typeof CreateCourseDto>;
