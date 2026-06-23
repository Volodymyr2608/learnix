import { format, subDays } from "date-fns";
import { env } from "@/lib/env";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { lessonProgressRepository } from "@/server/repositories/lessonProgress.repository";
import { messageRepository } from "@/server/repositories/message.repository";
import { notificationLogRepository } from "@/server/repositories/notificationLog.repository";
import { emailService } from "@/server/services/email/email.service";
import { signUnsubscribeToken } from "@/server/services/email/unsubscribe-token";
import { signCertificateToken } from "./auth";

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

		const logged = await notificationLogRepository.tryLog({
			dedupKey: `${enr.studentId}:certificate:${enr.courseId}`,
			userId: enr.studentId,
			automation: "certificate_earned",
		});
		if (!logged.created) return;

		const [certToken, unsubToken] = await Promise.all([
			signCertificateToken(enrollmentId),
			signUnsubscribeToken(enr.studentId),
		]);

		await emailService.send({
			templateKey: "course.certificate",
			toEmail: enr.student.email,
			userId: enr.studentId,
			payload: {
				studentName: enr.student.name,
				courseTitle: enr.course.title,
				instructorName: enr.course.instructor.name,
				certificatePdfUrl: `${env.BASE_URL}/api/certificates/${enrollmentId}?token=${certToken}`,
				unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${unsubToken}`,
			},
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

		const logged = await notificationLogRepository.tryLog({
			dedupKey: `${studentId}:near_completion:${courseId}`,
			userId: studentId,
			automation: "near_completion",
		});
		if (!logged.created) return;

		const unsubToken = await signUnsubscribeToken(studentId);
		const nextLessonUrl = progress.nextLessonId
			? `${env.BASE_URL}/dashboard/courses/${enr.course.id}/learn/${progress.nextLessonId}`
			: `${env.BASE_URL}/dashboard/courses/${enr.course.id}/learn`;

		await emailService.send({
			templateKey: "engagement.near-completion",
			toEmail: enr.student.email,
			userId: studentId,
			payload: {
				studentName: enr.student.name,
				courseTitle: enr.course.title,
				lessonsRemaining: progress.lessonsRemaining,
				nextLessonUrl,
				unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${unsubToken}`,
			},
		});
	}

	async fireNewMessage(messageId: string): Promise<void> {
		const msg = await messageRepository.findForNotification(messageId);
		if (!msg) return;

		const { conversation } = msg;
		const senderIsStudent = msg.senderId === conversation.studentId;
		const sender = senderIsStudent
			? conversation.student
			: conversation.instructor;
		const recipientId = senderIsStudent
			? conversation.instructorId
			: conversation.studentId;
		const recipient = senderIsStudent
			? conversation.instructor
			: conversation.student;
		const threadPath = senderIsStudent
			? "/instructor/messages"
			: "/dashboard/messages";

		// One email per recipient/conversation per 5-minute bucket.
		const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
		const logged = await notificationLogRepository.tryLog({
			dedupKey: `${recipientId}:new_message:${conversation.id}:${bucket}`,
			userId: recipientId,
			automation: "new_message",
		});
		if (!logged.created) return;

		const unsubToken = await signUnsubscribeToken(recipientId);

		await emailService.send({
			templateKey: "message.new",
			toEmail: recipient.email,
			userId: recipientId,
			payload: {
				recipientName: recipient.name,
				senderName: sender.name,
				courseTitle: conversation.course.title,
				messagePreview: msg.body.slice(0, 140),
				threadUrl: `${env.BASE_URL}${threadPath}?c=${conversation.id}`,
				unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${unsubToken}`,
			},
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
