import { EnrollmentStatus } from "@/generated/prisma";
import type {
	CourseSummary,
	CreateReviewInput,
	EligibilityResult,
} from "@/server/entities/review/review.dto";
import { courseRepository } from "@/server/repositories/course.repository";
import { courseReviewRepository } from "@/server/repositories/courseReview.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { ReviewError } from "@/server/services/review/review.errors";
import { logger } from "@/server/utils/logger";

class ReviewService {
	async getEligibility(
		studentId: string,
		courseId: string,
	): Promise<EligibilityResult> {
		const enrollment = await enrollmentRepository.findByStudentCourse(
			studentId,
			courseId,
		);

		if (!enrollment || enrollment.status !== EnrollmentStatus.completed) {
			return { state: "ineligible" };
		}

		const course = await this.buildCourseSummary(
			courseId,
			enrollment.completedAt ?? enrollment.enrolledAt,
		);
		if (!course) {
			return { state: "ineligible" };
		}

		const existing = await courseReviewRepository.findByStudentAndCourse(
			studentId,
			courseId,
		);

		if (existing) {
			return {
				state: "alreadyReviewed",
				course,
				review: {
					rating: existing.rating,
					comment: existing.comment,
					tags: existing.tags,
					createdAt: existing.createdAt.toISOString(),
				},
			};
		}

		return { state: "eligible", course };
	}

	async createReview(
		studentId: string,
		input: CreateReviewInput,
	): Promise<{ id: string }> {
		try {
			const enrollment = await enrollmentRepository.findByStudentCourse(
				studentId,
				input.courseId,
			);

			if (!enrollment || enrollment.status !== EnrollmentStatus.completed) {
				throw new ReviewError(
					"You can only review a course you have completed",
					"FORBIDDEN",
					undefined,
					{ studentId, courseId: input.courseId },
				);
			}

			const existing = await courseReviewRepository.findByStudentAndCourse(
				studentId,
				input.courseId,
			);

			if (existing) {
				throw new ReviewError(
					"You have already reviewed this course",
					"CONFLICT",
					undefined,
					{ studentId, courseId: input.courseId },
				);
			}

			const created = await courseReviewRepository.create({
				studentId,
				courseId: input.courseId,
				rating: input.rating,
				comment: input.comment,
				tags: input.tags,
			});

			return { id: created.id };
		} catch (error) {
			if (error instanceof ReviewError) throw error;
			logger.error("Failed to create review", { studentId, error });
			throw new ReviewError(
				"Failed to create review",
				"INTERNAL_SERVER_ERROR",
				error,
				{ studentId, courseId: input.courseId },
			);
		}
	}

	private async buildCourseSummary(
		courseId: string,
		completedAt: Date,
	): Promise<CourseSummary | null> {
		const course = await courseRepository.findFirst({
			where: { id: courseId, deletedAt: null },
			select: {
				id: true,
				title: true,
				duration: true,
				instructor: { select: { name: true } },
				sections: {
					where: { deletedAt: null },
					select: {
						lessons: { where: { deletedAt: null }, select: { id: true } },
					},
				},
			},
		});

		if (!course) return null;

		const totalLessons = course.sections.reduce(
			(sum: number, section: { lessons: unknown[] }) =>
				sum + section.lessons.length,
			0,
		);

		return {
			id: course.id,
			title: course.title,
			instructor: course.instructor.name,
			completedDate: completedAt.toLocaleDateString("en-US", {
				month: "long",
				day: "numeric",
				year: "numeric",
			}),
			totalLessons,
			duration: course.duration,
		};
	}
}

export const reviewService = new ReviewService();
