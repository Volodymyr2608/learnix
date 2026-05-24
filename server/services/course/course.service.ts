import type { Section } from "@/prisma/zod";
import type {
	CourseFullCreateDto,
	CourseFullUpdateDto,
	CourseWithSections,
} from "@/server/entities/course";
import { courseRepository } from "@/server/repositories/course.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { sectionRepository } from "@/server/repositories/section.repository";
import { CourseError } from "@/server/services/course/course.errors";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import { LessonError } from "@/server/services/lesson/lesson.errors";
import { SectionError } from "@/server/services/section/section.errors";
import { vercelService } from "@/server/services/versel/vercel.service";
import { logger } from "@/server/utils/logger";

class CourseService {
	async createCourse(dto: CourseFullCreateDto) {
		try {
			const { sections, ...courseData } = dto;

			const course = await courseRepository.transaction(async () => {
				const created = await courseRepository.create(courseData);

				const createdSections = await this.createSections(created.id, sections);

				await this.createLessons(sections, createdSections);

				return created;
			});

			if (course.status === "published") {
				void embeddingsService
					.embedCourse({
						id: course.id,
						title: course.title,
						subtitle: course.subtitle ?? null,
						description: course.description ?? null,
						objectives: course.objectives,
					})
					.catch((err) => logger.error("embedCourse failed:", err));
			}

			return course;
		} catch (error: unknown) {
			logger.error("Error creating course:", error);
			throw new CourseError(
				"Failed to create course",
				"INTERNAL_SERVER_ERROR",
				error,
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
				"INTERNAL_SERVER_ERROR",
				error,
				{ dto: sections },
			);
		}
	}

	private prepareSections(
		courseId: string,
		sections: CourseFullCreateDto["sections"],
	) {
		return sections.map((section, i) => ({
			courseId: courseId,
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
				"Failed to create lessons for sections",
				"INTERNAL_SERVER_ERROR",
				error,
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

	async updateCourse(courseId: string, dto: CourseFullUpdateDto, instructorId: string) {
		try {
			const { sections: newSections, ...incomingCourseData } = dto;
			let existingStatus: string | undefined;

			const result = await courseRepository.transaction(async () => {
				const existingCourse = await courseRepository.findFirst({
					where: { id: courseId, instructorId },
					include: {
						sections: { include: { lessons: true } },
					},
				});

				if (!existingCourse) {
					throw new CourseError(`Course ${courseId} not found`, "NOT_FOUND");
				}

				existingStatus = existingCourse.status;

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

			const isPublished = result.status === "published";
			const wasJustPublished = existingStatus !== "published" && isPublished;
			const embeddableFieldChanged =
				incomingCourseData.title !== undefined ||
				incomingCourseData.subtitle !== undefined ||
				incomingCourseData.description !== undefined ||
				incomingCourseData.objectives !== undefined;

			if (isPublished && (wasJustPublished || embeddableFieldChanged)) {
				void embeddingsService
					.embedCourse({
						id: result.id,
						title: result.title,
						subtitle: result.subtitle ?? null,
						description: result.description ?? null,
						objectives: result.objectives,
					})
					.catch((err) => logger.error("embedCourse failed:", err));
			} else if (existingStatus === "published" && !isPublished) {
				void embeddingsService
					.removeCourseEmbedding(result.id)
					.catch((err) => logger.error("removeCourseEmbedding failed:", err));
			}

			return result;
		} catch (error: unknown) {
			logger.error("Error updating course:", error);

			if (error instanceof CourseError) {
				throw error;
			}

			throw new CourseError(
				"Failed to update course",
				"INTERNAL_SERVER_ERROR",
				error,
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
		}

		// preview video updates
		if (
			existing.previewVideoUrl &&
			incoming.previewVideoUrl &&
			incoming.previewVideoUrl !== existing.previewVideoUrl
		) {
			vercelService.deleteFileFromVercelStorage(existing.previewVideoUrl);
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
				"INTERNAL_SERVER_ERROR",
				error,
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

						if (!updatedSec) continue;

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
				"Failed to sync lessons",
				"INTERNAL_SERVER_ERROR",
				error,
				{
					newSectionsCount: newSections.length,
					updatedSectionIds: updatedSections.map((s) => s.id),
				},
			);
		}
	}

	async getPublishedCourse(courseId: string) {
		try {
			const course = await courseRepository.getPublishedCourse(courseId);

			if (!course) {
				throw new CourseError("Course not found", "NOT_FOUND", undefined, {
					courseId,
				});
			}

			const instructorStats = await courseRepository.getInstructorStats(
				course.instructorId,
			);

			const instructorRating = Number(
				(instructorStats.instructorRating ?? 0).toFixed(1),
			);
			const reviewCount = course.reviews.length;
			const courseRating =
				reviewCount > 0
					? Number(
							(
								course.reviews.reduce((sum, review) => sum + review.rating, 0) /
								reviewCount
							).toFixed(1),
						)
					: Number(course.averageRating.toFixed(1));

			const ratingDistribution = [5, 4, 3, 2, 1].map((stars) => {
				const count = course.reviews.filter(
					(review) => review.rating === stars,
				).length;
				const percentage =
					reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;

				return { stars, count, percentage };
			});

			const curriculum = course.sections.map((section) => ({
				id: section.id,
				section: section.title,
				lectures: section.lessons.length,
				duration: this.sumDurations(section.lessons),
				lessons: section.lessons.map((lesson, index) => ({
					id: lesson.id,
					title: lesson.title,
					duration: lesson.duration,
					preview: index === 0,
				})),
			}));

			const reviews = course.reviews.map((review) => ({
				id: review.id,
				name: review.student.name,
				avatar: review.student.image,
				date: review.createdAt.toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "numeric",
				}),
				rating: review.rating,
				comment: review.comment,
			}));

			return {
				id: course.id,
				title: course.title,
				subtitle: course.subtitle,
				instructor: {
					name: course.instructor.name,
					avatar: course.instructor.image,
					students: instructorStats.studentsCount,
					courses: instructorStats.coursesCount,
					rating: instructorRating,
				},
				rating: courseRating,
				reviewCount,
				ratingDistribution,
				students: course._count.enrollments,
				duration: course.duration,
				price: Number(course.price),
				originalPrice: course.originalPrice
					? Number(course.originalPrice)
					: null,
				level: course.level,
				language: course.language,
				lastUpdated: course.updatedAt.toLocaleDateString("en-US", {
					month: "long",
					year: "numeric",
				}),
				thumbnail: course.thumbnailUrl,
				category: course.category,
				objectives: course.objectives,
				requirements: course.requirements,
				description: course.description,
				curriculum,
				reviews,
			};
		} catch (error: unknown) {
			logger.error("Error getting published course:", error);

			if (error instanceof CourseError) {
				throw error;
			}

			throw new CourseError(
				"Failed to get published course",
				"INTERNAL_SERVER_ERROR",
				error,
				{ courseId },
			);
		}
	}

	private sumDurations(lessons: { duration: string | null }[]) {
		let totalMinutes = 0;

		for (const lesson of lessons) {
			if (!lesson.duration) continue;

			const [min, sec] = lesson.duration.split(":").map(Number);

			if (min && sec) {
				totalMinutes += Math.floor(min + sec / 60);
			}
		}

		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;

		return `${hours}h ${minutes}m`;
	}
}

export const courseService = new CourseService();
