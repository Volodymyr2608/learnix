import { EnrollmentStatus } from "@/generated/prisma";
import { courseRepository } from "@/server/repositories/course.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
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

			if (!existingEnrollment) {
				await enrollmentRepository.create({
					studentId,
					courseId,
					status: EnrollmentStatus.active,
				});

				return { alreadyEnrolled: false };
			}

			if (existingEnrollment.status === EnrollmentStatus.cancelled) {
				await enrollmentRepository.update(existingEnrollment.id, {
					status: EnrollmentStatus.active,
					enrolledAt: new Date(),
					completedAt: null,
				});
			}

			return { alreadyEnrolled: true };
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

	async getStudentEnrolledCourses(studentId: string) {
		try {
			const enrollments = await enrollmentRepository.findMany({
				where: {
					studentId,
					course: {
						status: "published",
						deletedAt: null,
					},
				},
				orderBy: {
					enrolledAt: "desc",
				},
				include: {
					course: {
						select: {
							id: true,
							title: true,
							thumbnailUrl: true,
							duration: true,
							sections: {
								select: {
									lessons: {
										select: {
											id: true,
										},
									},
								},
							},
							courseProgresses: {
								where: {
									studentId,
								},
								select: {
									progress: true,
									completedLessons: true,
									totalLessons: true,
								},
								take: 1,
							},
							instructor: {
								select: {
									name: true,
								},
							},
						},
					},
				},
			});

			return enrollments.map((enrollment) => {
				const progress = enrollment.course.courseProgresses[0];
				const totalLessonsFromSections = enrollment.course.sections.reduce(
					(total, section) => total + section.lessons.length,
					0,
				);
				const totalLessons = progress?.totalLessons ?? totalLessonsFromSections;
				const completedLessons = progress?.completedLessons ?? 0;
				const progressPercent = Math.round(
					progress?.progress ?? enrollment.progress,
				);
				const status =
					enrollment.status === EnrollmentStatus.completed ||
					(totalLessons > 0 && completedLessons >= totalLessons)
						? "Completed"
						: "In Progress";

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
				};
			});
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
}

export const enrollmentService = new EnrollmentService();
