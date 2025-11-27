import type { Course } from "@/generated/prisma";
import { CourseStatus } from "@/generated/prisma";
import type {
	CourseCreateDto,
	CourseFullCreateDto,
	CourseFullUpdateDto,
	CourseUpdateDto,
} from "@/server/entities/course";
import BaseRepository from "@/server/repositories/baseRepository";
import type LessonRepository from "@/server/repositories/lessonRepository";
import { lessonRepository } from "@/server/repositories/lessonRepository";
import type QuizRepository from "@/server/repositories/quizRepository";
import { quizRepository } from "@/server/repositories/quizRepository";
import type SectionRepository from "@/server/repositories/sectionRepository";
import { sectionRepository } from "@/server/repositories/sectionRepository";
import type VercelService from "@/server/services/vercelService";
import { vercelService } from "@/server/services/vercelService";

export default class CourseRepository extends BaseRepository<
	Course,
	CourseCreateDto,
	CourseUpdateDto
> {
	protected readonly model = "course";

	private sectionRepository: SectionRepository;
	private lessonRepository: LessonRepository;
	private vercelService: VercelService;
	private quizRepository: QuizRepository;

	constructor() {
		super();
		this.sectionRepository = sectionRepository;
		this.lessonRepository = lessonRepository;
		this.vercelService = vercelService;
		this.quizRepository = quizRepository;
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
						duration: lessonData.duration ?? null,
						order: j + 1,
					});
				}
			}

			return {
				success: true,
			};
		});
	}

	async updateCourse(courseId: string, coursePayload: CourseFullUpdateDto) {
		return this.transaction(async () => {
			const { sections, ...rest } = coursePayload;

			const currentCourse = await this.findFirst({
				where: { id: courseId },
			});

			if (!currentCourse) throw new Error("Course not found");

			if (currentCourse.thumbnailUrl) {
				if (rest.thumbnailUrl !== currentCourse.thumbnailUrl) {
					await this.vercelService.deleteFileFromVercelStorage(
						currentCourse.thumbnailUrl,
					);
				}
			}

			if (currentCourse.previewVideoUrl) {
				if (rest.previewVideoUrl !== currentCourse.previewVideoUrl) {
					await this.vercelService.deleteFileFromVercelStorage(
						currentCourse.previewVideoUrl,
					);
				}
			}

			await this.update(courseId, rest as CourseUpdateDto);

			await this.sectionRepository.deleteMany({
				courseId,
			});

			for (const [i, sectionData] of sections.entries()) {
				const section = await this.sectionRepository.create({
					courseId,
					title: sectionData.title,
					order: i + 1,
				});

				for (const [j, lessonData] of sectionData.lessons.entries()) {
					await this.lessonRepository.create({
						sectionId: section.id,
						title: lessonData.title,
						duration: lessonData.duration ?? null,
						order: j + 1,
					});
				}
			}

			return {
				success: true,
			};
		});
	}

	public async deleteCourse(
		id: string,
		softDelete: boolean = this.isSoftDelete,
	): Promise<boolean> {
		try {
			this.logger?.info("Deleting course", { id, softDelete });

			if (softDelete) {
				const now = new Date();

				return this.transaction(async () => {
					await this.update(id, { deletedAt: now } as CourseUpdateDto);

					await this.sectionRepository.updateMany(
						{ courseId: id },
						{ deletedAt: now },
					);
					await this.lessonRepository.updateMany(
						{ section: { courseId: id } },
						{ deletedAt: now },
					);
					await this.quizRepository.updateMany(
						{ lesson: { section: { courseId: id } } },
						{ deletedAt: now },
					);

					return true;
				});
			}

			await this.delete(id);

			return true;
		} catch (error) {
			return this.handleError(error, `delete course with ID ${id}`, {
				id,
				softDelete,
			});
		}
	}

	async getOwnCourses(userId: string) {
		try {
			this.logger?.info("Get own courses", { userId });

			return await this.findMany({
				where: {
					instructorId: userId,
					deletedAt: null,
				},
				select: {
					id: true,
					title: true,
					status: true,
					updatedAt: true,
					thumbnailUrl: true,
				},
			});
		} catch (error) {
			return this.handleError(error, `Get own course with user id ${userId}`, {
				userId,
			});
		}
	}

	async getOwnCourse(courseId: string, instructorId: string) {
		return await this.findFirst({
			where: { id: courseId, instructorId: instructorId },
			include: {
				sections: {
					include: { lessons: true },
				},
			},
		});
	}

	async getCoursesStats(instructorId: string) {
		try {
			this.logger?.info("Getting course stats", { instructorId });

			const now = new Date();

			const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
			const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

			const mainStats = await this.transaction(async () => {
				const draft = await this.count({
					status: CourseStatus.draft,
					instructorId,
					deletedAt: null,
				});

				const published = await this.count({
					status: CourseStatus.published,
					instructorId,
					deletedAt: null,
				});

				const lastCourses = await this.count({
					createdAt: {
						gte: startOfMonth,
						lte: endOfMonth,
					},
					instructorId,
					deletedAt: null,
				});

				return {
					draft,
					published,
					lastCourses,
				};
			});

			return {
				...mainStats,
				total: mainStats.draft + mainStats.published,
			};
		} catch (error) {
			return this.handleError(
				error,
				`Get courses stats with instructor id ${instructorId}`,
				{
					instructorId,
				},
			);
		}
	}
}

export const courseRepository = new CourseRepository();
