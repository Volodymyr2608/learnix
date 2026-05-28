import { format, subDays } from "date-fns";
import { env } from "@/lib/env";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { lessonProgressRepository } from "@/server/repositories/lessonProgress.repository";
import { signUnsubscribeToken } from "@/server/services/email/unsubscribe-token";
import { signCertificateToken } from "./auth";
import { notificationEmitter } from "./notificationEmitter";

export type InactiveStudentItem = {
	userId: string;
	email: string;
	name: string;
	emailNotificationsEnabled: boolean;
	courseId: string;
	courseTitle: string;
	progressPct: number;
	nextLessonTitle: string;
	resumeUrl: string;
	unsubscribeUrl: string;
	lastActivityAt: string;
	dedupKey: string;
};

class NotificationService {
	async fireCertificateEarned(enrollmentId: string): Promise<void> {
		const enr = await enrollmentRepository.findByIdWithRelations(enrollmentId);
		if (!enr) return;

		const [certToken, unsubToken] = await Promise.all([
			signCertificateToken(enrollmentId),
			signUnsubscribeToken(enr.studentId),
		]);

		void notificationEmitter.emit("certificate.earned", {
			user: {
				id: enr.studentId,
				email: enr.student.email,
				name: enr.student.name,
				emailNotificationsEnabled: enr.student.emailNotificationsEnabled,
				unsubscribeToken: unsubToken,
			},
			course: {
				id: enr.courseId,
				title: enr.course.title,
				instructorName: enr.course.instructor.name,
			},
			enrollment: {
				id: enr.id,
				completedAt: enr.completedAt?.toISOString(),
			},
			certificatePdfUrl: `${env.BASE_URL}/api/certificates/${enrollmentId}?token=${certToken}`,
			unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${unsubToken}`,
		});
	}

	async fireProgressNearCompletion(
		studentId: string,
		courseId: string,
		progress: {
			completedLessons: number;
			totalLessons: number;
			lessonsRemaining: number;
			nextLessonId: string | null;
			nextLessonTitle: string;
		},
	): Promise<void> {
		const enr = await enrollmentRepository.findByStudentCourseWithRelations(
			studentId,
			courseId,
		);
		if (!enr) return;

		const unsubToken = await signUnsubscribeToken(studentId);
		const nextLessonUrl = progress.nextLessonId
			? `${env.BASE_URL}/dashboard/courses/${enr.course.id}/learn/${progress.nextLessonId}`
			: `${env.BASE_URL}/dashboard/courses/${enr.course.id}/learn`;

		void notificationEmitter.emit("progress.near_completion", {
			user: {
				id: studentId,
				email: enr.student.email,
				name: enr.student.name,
				emailNotificationsEnabled: enr.student.emailNotificationsEnabled,
				unsubscribeToken: unsubToken,
			},
			course: { id: courseId, title: enr.course.title },
			progress: { ...progress, nextLessonUrl },
			unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${unsubToken}`,
		});
	}

	async findInactiveStudents(params: {
		inactiveDays: number;
		minPct: number;
		maxPct: number;
	}): Promise<InactiveStudentItem[]> {
		const cutoff = subDays(new Date(), params.inactiveDays);
		const today = format(new Date(), "yyyy-MM-dd");

		const enrollments = await enrollmentRepository.findActiveWithLessons();

		const results: InactiveStudentItem[] = [];

		for (const enr of enrollments) {
			const allLessons = enr.course.sections.flatMap((s) => s.lessons);
			const totalLessons = allLessons.length;
			if (totalLessons === 0) continue;

			const progresses =
				await lessonProgressRepository.findCompletedByLessonIds(
					enr.studentId,
					allLessons.map((l) => l.id),
				);

			if (progresses.length === 0) continue;

			const progressPct = Math.round((progresses.length / totalLessons) * 100);
			if (progressPct < params.minPct || progressPct > params.maxPct) continue;

			const latestActivityAt = progresses[0]?.updatedAt;
			if (!latestActivityAt || latestActivityAt >= cutoff) continue;

			const completedIds = new Set(progresses.map((p) => p.lessonId));
			const nextLesson = allLessons.find((l) => !completedIds.has(l.id));

			const resumeUrl = nextLesson
				? `${env.BASE_URL}/dashboard/courses/${enr.courseId}/learn/${nextLesson.id}`
				: `${env.BASE_URL}/dashboard/courses/${enr.courseId}/learn`;

			const unsubToken = await signUnsubscribeToken(enr.studentId);
			const unsubscribeUrl = `${env.BASE_URL}/unsubscribe?token=${unsubToken}`;

			results.push({
				userId: enr.studentId,
				email: enr.student.email,
				name: enr.student.name,
				emailNotificationsEnabled: enr.student.emailNotificationsEnabled,
				courseId: enr.courseId,
				courseTitle: enr.course.title,
				progressPct,
				nextLessonTitle: nextLesson?.title ?? "",
				resumeUrl,
				unsubscribeUrl,
				lastActivityAt: latestActivityAt.toISOString(),
				dedupKey: `${enr.studentId}:inactivity_7d:${enr.courseId}:${today}`,
			});
		}

		return results;
	}
}

export const notificationService = new NotificationService();
