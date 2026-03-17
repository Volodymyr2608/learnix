import type { CourseGenerationMessage } from "@/generated/prisma";
import type {
	CourseGenerationMessageCreateDto,
	CourseGenerationMessageUpdateDto,
} from "@/server/entities/course";
import BaseRepository from "@/server/repositories/baseRepository";

export default class CourseGenerationMessageRepository extends BaseRepository<
	CourseGenerationMessage,
	CourseGenerationMessageCreateDto,
	CourseGenerationMessageUpdateDto
> {
	protected readonly model = "courseGenerationMessage";
}

export const courseGenerationMessageRepository =
	new CourseGenerationMessageRepository();
