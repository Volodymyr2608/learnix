import { CourseStatus, EnrollmentStatus, Prisma } from "@/generated/prisma";
import { COURSE_PAGE_SIZE } from "@/lib/constants/pagination";
import { env } from "@/lib/env";
import { courseRepository } from "@/server/repositories/course.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { emailService } from "@/server/services/email/email.service";
import { signUnsubscribeToken } from "@/server/services/email/unsubscribe-token";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import { EnrollmentError } from "@/server/services/enrollment/enrollment.errors";
import { logger } from "@/server/utils/logger";

class EnrollmentService {
	async enrollInCourse(studentId: string, courseId: string) {
		try {
			const course = await courseRepository.findFirst({
				where: {
					id: courseId,
					status: "published",
					deletedAt: null,
				},
				select: {
					id: true,
					instructorId: true,
				},
			});

			if (!course) {
				throw new EnrollmentError("Course not found", "NOT_FOUND", undefined, {
					courseId,
				});
			}

			if (course.instructorId === studentId) {
				throw new EnrollmentError(
					"You cannot enroll in your own course",
					"BAD_REQUEST",
					undefined,
					{ courseId, studentId },
				);
			}

			const existingEnrollment = await enrollmentRepository.findFirst({
				where: {
					studentId,
					courseId,
				},
				select: {
					id: true,
					status: true,
				},
			});

			let alreadyEnrolled = true;

			if (!existingEnrollment) {
				await enrollmentRepository.create({
					studentId,
					courseId,
					status: EnrollmentStatus.active,
				});
				alreadyEnrolled = false;
			} else if (existingEnrollment.status === EnrollmentStatus.cancelled) {
				await enrollmentRepository.update(existingEnrollment.id, {
					status: EnrollmentStatus.active,
					enrolledAt: new Date(),
					completedAt: null,
				});
			}

			void embeddingsService
				.recomputeUserInterest(studentId)
				.catch((err) => logger.error("recomputeUserInterest failed:", err));

			if (!alreadyEnrolled) {
				void (async () => {
					try {
						const student = await userRepository.findFirst({
							where: { id: studentId },
							select: { email: true, name: true },
						});
						const enrolledCourse = await courseRepository.findFirst({
							where: { id: courseId },
							select: { title: true, id: true },
						});
						if (student && enrolledCourse) {
							const token = await signUnsubscribeToken(studentId);
							await emailService.send({
								templateKey: "enrollment.confirmed",
								toEmail: student.email,
								userId: studentId,
								payload: {
									studentName: student.name ?? student.email,
									courseTitle: enrolledCourse.title,
									courseUrl: `${env.BASE_URL}/dashboard/courses/${enrolledCourse.id}/learn`,
									unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${token}`,
								},
							});
						}
					} catch (err) {
						logger.error("enrollment email failed", err);
					}
				})();
			}

			return { alreadyEnrolled };
		} catch (error) {
			if (error instanceof EnrollmentError) {
				throw error;
			}

			logger.error("Failed to enroll student in course:", error);
			throw new EnrollmentError(
				"Failed to enroll in this course",
				"BAD_REQUEST",
				error,
				{
					studentId,
					courseId,
				},
			);
		}
	}

	async getStudentEnrolledCourses(
		studentId: string,
		params?: { tab?: "all" | "in-progress" | "completed"; page?: number },
	) {
		const { tab = "all", page = 1 } = params ?? {};

		const statusFilter: Prisma.EnrollmentWhereInput =
			tab === "completed"
				? { status: EnrollmentStatus.completed }
				: tab === "in-progress"
					? { status: EnrollmentStatus.active }
					: {
							status: {
								in: [EnrollmentStatus.active, EnrollmentStatus.completed],
							},
						};

		const where: Prisma.EnrollmentWhereInput = {
			studentId,
			...statusFilter,
			course: { status: CourseStatus.published, deletedAt: null },
		};

		try {
			const [enrollments, total] = await Promise.all([
				enrollmentRepository.findMany({
					where,
					orderBy: { enrolledAt: "desc" },
					skip: (page - 1) * COURSE_PAGE_SIZE,
					take: COURSE_PAGE_SIZE,
					include: {
						course: {
							select: {
								id: true,
								title: true,
								thumbnailUrl: true,
								duration: true,
								sections: {
									where: { deletedAt: null },
									orderBy: { order: Prisma.SortOrder.asc },
									select: {
										lessons: {
											where: { deletedAt: null },
											orderBy: { order: Prisma.SortOrder.asc },
											select: {
												id: true,
												progresses: {
													where: { studentId },
													select: { isCompleted: true },
													take: 1,
												},
											},
										},
									},
								},
								instructor: { select: { name: true } },
							},
						},
					},
				}),
				enrollmentRepository.count(where),
			]);

			const courses = enrollments.map((enrollment) => {
				const allLessons = enrollment.course.sections.flatMap((s) => s.lessons);
				const totalLessons = allLessons.length;
				const completedLessons = allLessons.filter(
					(l) => l.progresses[0]?.isCompleted,
				).length;
				const progressPercent =
					totalLessons > 0
						? Math.round((completedLessons / totalLessons) * 100)
						: 0;
				const status =
					enrollment.status === EnrollmentStatus.completed ||
					(totalLessons > 0 && completedLessons >= totalLessons)
						? "Completed"
						: "In Progress";
				const nextLessonId =
					allLessons.find((l) => !l.progresses[0]?.isCompleted)?.id ??
					allLessons[0]?.id ??
					null;

				return {
					id: enrollment.course.id,
					title: enrollment.course.title,
					instructor: enrollment.course.instructor.name,
					progress: progressPercent,
					totalLessons,
					completedLessons,
					duration: enrollment.course.duration,
					thumbnail: enrollment.course.thumbnailUrl ?? "/placeholder.svg",
					status,
					nextLessonId,
				};
			});

			return { courses, total };
		} catch (error) {
			logger.error("Failed to fetch enrolled courses for student:", error);
			throw new EnrollmentError(
				"Failed to fetch enrolled courses",
				"BAD_REQUEST",
				error,
				{ studentId },
			);
		}
	}

	async getStudentCourse(studentId: string, courseId: string) {
		try {
			const enrollment = await enrollmentRepository.findFirst({
				where: {
					studentId,
					courseId,
					status: { not: EnrollmentStatus.cancelled },
					course: { deletedAt: null },
				},
				select: {
					id: true,
					course: {
						select: {
							id: true,
							title: true,
							instructor: { select: { name: true } },
							sections: {
								where: { deletedAt: null },
								orderBy: { order: "asc" },
								select: {
									id: true,
									title: true,
									lessons: {
										where: { deletedAt: null },
										orderBy: { order: "asc" },
										select: {
											id: true,
											title: true,
											durationMinutes: true,
											progresses: {
												where: { studentId },
												select: { isCompleted: true },
												take: 1,
											},
										},
									},
								},
							},
						},
					},
				},
			});

			if (!enrollment) return null;

			const { course } = enrollment;
			return {
				id: course.id,
				title: course.title,
				instructor: course.instructor.name,
				sections: course.sections.map((section) => ({
					id: section.id,
					title: section.title,
					lessons: section.lessons.map((lesson) => ({
						id: lesson.id,
						title: lesson.title,
						durationMinutes: lesson.durationMinutes,
						isCompleted: lesson.progresses[0]?.isCompleted ?? false,
					})),
				})),
			};
		} catch (error) {
			logger.error("Failed to fetch student course:", error);
			throw new EnrollmentError(
				"Failed to fetch course",
				"BAD_REQUEST",
				error,
				{ studentId, courseId },
			);
		}
	}
}

export const enrollmentService = new EnrollmentService();
