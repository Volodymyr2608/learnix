import type { Lesson } from "@/generated/prisma";
import type {
	LessonCreateDto,
	LessonUpdateDto,
} from "@/server/entities/course";
import BaseRepository from "@/server/repositories/baseRepository";

export default class LessonRepository extends BaseRepository<
	Lesson,
	LessonCreateDto,
	LessonUpdateDto
> {
	protected readonly model = "lesson";
}

export const lessonRepository = new LessonRepository();
