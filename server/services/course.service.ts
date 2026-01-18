import type { Section } from "@/prisma/zod";
import type {
	CourseFullCreateDto,
	CourseFullUpdateDto,
	CourseWithSections,
} from "@/server/entities/course";
import { courseRepository } from "@/server/repositories/courseRepository";
import { lessonRepository } from "@/server/repositories/lessonRepository";
import { sectionRepository } from "@/server/repositories/sectionRepository";
import { CourseError } from "@/server/services/errors/course.errors";
import { LessonError } from "@/server/services/errors/lesson.errors";
import { SectionError } from "@/server/services/errors/section.errors";
import { vercelService } from "@/server/services/vercel.service";
import { logger } from "@/server/utils/logger";

class CourseService {
	async createCourse(dto: CourseFullCreateDto) {
		try {
			const { sections, ...courseData } = dto;

			return await courseRepository.transaction(async () => {
				const course = await courseRepository.create(courseData);

				const createdSections = await this.createSections(course.id, sections);

				await this.createLessons(sections, createdSections);

				return course;
			});
		} catch (error: unknown) {
			logger.error("Error creating course:", error);
			throw new CourseError(
				`Failed to create course`,
				{ cause: error },
				{ dto },
			);
		}
	}

	private async createSections(
		courseId: string,
		sections: CourseFullCreateDto["sections"],
	) {
		try {
			const sectionsDtos = this.prepareSections(courseId, sections);

			return await sectionRepository.createManyAndReturn(sectionsDtos);
		} catch (error) {
			logger.error("Error creating sections:", error);
			throw new SectionError(
				`Failed to create sections for course ${courseId}`,
				{ cause: error },
				{ dto: sections },
			);
		}
	}

	private prepareSections(
		courseId: string,
		sections: CourseFullCreateDto["sections"],
	) {
		return sections.map((section, i) => ({
			courseId,
			title: section.title,
			order: i + 1,
		}));
	}

	private async createLessons(
		sections: CourseFullCreateDto["sections"],
		createdSections: Section[],
	) {
		try {
			const lessonsDtos = this.prepareLessons(sections, createdSections);

			return await lessonRepository.bulkCreate(lessonsDtos);
		} catch (error) {
			logger.error("Error creating lessons:", error);
			throw new LessonError(
				`Failed to create lessons for sections`,
				{ cause: error },
				{ dto: sections.length },
			);
		}
	}

	private prepareLessons(
		sections: CourseFullCreateDto["sections"],
		createdSections: Section[],
	) {
		return sections.flatMap((s, i) =>
			s.lessons.map((l, j) => ({
				sectionId: createdSections[i]?.id ?? "",
				title: l.title,
				duration: l.duration ?? null,
				order: j + 1,
			})),
		);
	}

	async updateCourse(courseId: string, dto: CourseFullUpdateDto) {
		try {
			const { sections: newSections, ...incomingCourseData } = dto;

			return await courseRepository.transaction(async () => {
				const existingCourse = await courseRepository.findFirst({
					where: { id: courseId },
					include: {
						sections: { include: { lessons: true } },
					},
				});

				if (!existingCourse) {
					throw new CourseError(`Course ${courseId} not found`);
				}

				const courseDataToUpdate = this.prepareCourseUpdate(
					existingCourse as CourseWithSections,
					incomingCourseData,
				);

				const course = await courseRepository.update(
					courseId,
					courseDataToUpdate,
				);

				const existingSections = (existingCourse as CourseWithSections)
					.sections;

				const updatedSections = await this.syncSections(
					existingSections,
					newSections,
					courseId,
				);

				await this.syncLessons(existingSections, newSections, updatedSections);

				return {
					...course,
					sections: updatedSections,
				};
			});
		} catch (error: unknown) {
			logger.error("Error updating course:", error);
			throw new CourseError(
				`Failed to update course`,
				{ cause: error },
				{ dto },
			);
		}
	}

	private prepareCourseUpdate(
		existing: CourseWithSections,
		incoming: Omit<CourseFullUpdateDto, "sections">,
	) {
		const result = { ...incoming };

		// thumbnail updates
		if (
			existing.thumbnailUrl &&
			incoming.thumbnailUrl &&
			incoming.thumbnailUrl !== existing.thumbnailUrl
		) {
			vercelService.deleteFileFromVercelStorage(existing.thumbnailUrl);
		} else {
			delete result.thumbnailUrl;
		}

		// preview video updates
		if (
			existing.previewVideoUrl &&
			incoming.previewVideoUrl &&
			incoming.previewVideoUrl !== existing.previewVideoUrl
		) {
			vercelService.deleteFileFromVercelStorage(existing.previewVideoUrl);
		} else {
			delete result.previewVideoUrl;
		}

		return result;
	}

	private async syncSections(
		existingSections: CourseWithSections["sections"],
		newSections: CourseFullUpdateDto["sections"],
		courseId: string,
	) {
		try {
			return await sectionRepository.transaction(async () => {
				const updatedSections: Section[] = [];

				for (const [i, sectionData] of newSections.entries()) {
					if (sectionData.id) {
						const updated = await sectionRepository.update(sectionData.id, {
							title: sectionData.title,
							order: i + 1,
						});

						updatedSections.push(updated);
						continue;
					}

					const created = await sectionRepository.create({
						courseId,
						title: sectionData.title,
						order: i + 1,
					});

					updatedSections.push(created);
				}

				const idsToKeep = newSections.filter((s) => s.id).map((s) => s.id);
				const toDelete = existingSections.filter(
					(s) => !idsToKeep.includes(s.id),
				);

				for (const sec of toDelete) {
					await sectionRepository.delete(sec.id);
				}
				return updatedSections;
			});
		} catch (error) {
			logger.error("Error syncing sections:", error);

			throw new SectionError(
				`Failed to sync sections for course ${courseId}`,
				{ cause: error },
				{ existingSections, newSections },
			);
		}
	}

	private async syncLessons(
		existingSections: CourseWithSections["sections"],
		newSections: CourseFullUpdateDto["sections"],
		updatedSections: Section[],
	) {
		try {
			return await lessonRepository.transaction(async () => {
				for (const [i, sectionData] of newSections.entries()) {
					const updatedSec = updatedSections[i];

					const existingLessons =
						existingSections.find((s) => s.id === sectionData.id)?.lessons ??
						[];

					const newLessons = sectionData.lessons;

					for (const [j, lessonData] of newLessons.entries()) {
						if (lessonData.id) {
							await lessonRepository.update(lessonData.id, {
								title: lessonData.title,
								duration: lessonData.duration ?? null,
								order: j + 1,
							});
							continue;
						}

						await lessonRepository.create({
							sectionId: updatedSec.id,
							title: lessonData.title,
							duration: lessonData.duration ?? null,
							order: j + 1,
						});
					}

					const newIds = newLessons.filter((l) => l.id).map((l) => l.id);
					const toDelete = existingLessons.filter(
						(l) => !newIds.includes(l.id),
					);

					for (const lesson of toDelete) {
						await lessonRepository.delete(lesson.id);
					}
				}
			});
		} catch (error) {
			logger.error("Error syncing lessons:", error);

			throw new LessonError(
				`Failed to sync lessons`,
				{ cause: error },
				{
					newSectionsCount: newSections.length,
					updatedSectionIds: updatedSections.map((s) => s.id),
				},
			);
		}
	}
}

export const courseService = new CourseService();
