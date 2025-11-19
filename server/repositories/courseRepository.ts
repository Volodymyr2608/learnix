import type { Course } from "@/generated/prisma";
import type {
	CourseCreateDto,
	CourseFullCreateDto,
	CourseUpdateDto,
} from "@/server/entities/course";
import BaseRepository from "@/server/repositories/baseRepository";
import type LessonRepository from "@/server/repositories/lessonRepository";
import { lessonRepository } from "@/server/repositories/lessonRepository";
import type SectionRepository from "@/server/repositories/sectionRepository";
import { sectionRepository } from "@/server/repositories/sectionRepository";

export default class CourseRepository extends BaseRepository<
	Course,
	CourseCreateDto,
	CourseUpdateDto
> {
	protected readonly model = "course";

	private sectionRepository: SectionRepository;
	private lessonRepository: LessonRepository;

	constructor() {
		super();
		this.sectionRepository = sectionRepository;
		this.lessonRepository = lessonRepository;
	}

	async createCourse(coursePayload: CourseFullCreateDto) {
		return this.transaction(async () => {
			const { sections, ...rest } = coursePayload;

			const course = await this.create(rest as CourseCreateDto);

			for (const [i, sectionData] of sections.entries()) {
				const section = await this.sectionRepository.create({
					courseId: course.id,
					title: sectionData.title,
					order: i + 1,
				});

				for (const [j, lessonData] of sectionData.lessons.entries()) {
					await this.lessonRepository.create({
						sectionId: section.id,
						title: lessonData.title,
						duration: lessonData.duration,
						order: j + 1,
					});
				}
			}

			return {
				success: true,
			};
		});
	}

	async getOwnCourses(userId: string) {
		return await this.findMany({
			where: {
				instructorId: userId,
			},
			select: {
				id: true,
				title: true,
				status: true,
				updatedAt: true,
				thumbnailUrl: true,
			},
		});
	}

	async getCourseByIdAndInstructorId(courseId: string, instructorId: string) {
		return await this.findFirst({
			where: { id: courseId, instructorId: instructorId },
			include: {
				sections: {
					include: { lessons: true },
				},
			},
		});
	}
}

export const courseRepository = new CourseRepository();
