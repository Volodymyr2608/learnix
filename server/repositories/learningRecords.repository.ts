import type { Prisma } from "@/generated/prisma";

/** Records of every lesson of the course, soft-deleted lessons and sections included. */
const inCourse = (courseId: string) => ({ section: { courseId } });

/**
 * FR-P9 / AI-L13 — a refunded course's learning records. Every method takes the caller's
 * transaction: the refund effects run once, behind one compare-and-set (C8).
 */
export const learningRecordsRepository = {
	/**
	 * Archives the course's completed minutes and lessons per UTC day (A11), then deletes lesson
	 * progress, opened lessons, quiz attempts, tutor messages and conversations, concept checks and
	 * the learning-path cache, and resets the enrollment's progress. Concept mastery is kept.
	 */
	async clearForRefund(
		tx: Prisma.TransactionClient,
		studentId: string,
		courseId: string,
	): Promise<void> {
		// A completed row without a completedAt has no day, and no daily statistic counts it either.
		await tx.$executeRaw`
			INSERT INTO study_archive (student_id, day, minutes, lessons)
			SELECT lp."studentId",
			       date_trunc('day', lp."completedAt"),
			       COALESCE(SUM(l.duration_minutes), 0)::int,
			       COUNT(*)::int
			  FROM lesson_progress lp
			  JOIN lessons l ON l.id = lp."lessonId"
			  JOIN sections s ON s.id = l."sectionId"
			 WHERE lp."studentId" = ${studentId}
			   AND s."courseId" = ${courseId}
			   AND lp."isCompleted" = true
			   AND lp."completedAt" IS NOT NULL
			 GROUP BY lp."studentId", date_trunc('day', lp."completedAt")
			ON CONFLICT (student_id, day) DO UPDATE
			   SET minutes = study_archive.minutes + EXCLUDED.minutes,
			       lessons = study_archive.lessons + EXCLUDED.lessons`;

		// The achievement counting correct answers has no date; file them under today.
		await tx.$executeRaw`
			INSERT INTO study_archive (student_id, day, minutes, lessons, correct_answers)
			SELECT qa."studentId", date_trunc('day', now() AT TIME ZONE 'UTC'), 0, 0, COUNT(*)::int
			  FROM quiz_attempts qa
			  JOIN quizzes q ON q.id = qa."quizId"
			  JOIN lessons l ON l.id = q."lessonId"
			  JOIN sections s ON s.id = l."sectionId"
			 WHERE qa."studentId" = ${studentId}
			   AND s."courseId" = ${courseId}
			   AND qa."isCorrect" = true
			 GROUP BY qa."studentId"
			ON CONFLICT (student_id, day) DO UPDATE
			   SET correct_answers = study_archive.correct_answers + EXCLUDED.correct_answers`;

		const lesson = inCourse(courseId);
		await tx.lessonProgress.deleteMany({ where: { studentId, lesson } });
		await tx.openedLesson.deleteMany({ where: { studentId, lesson } });
		await tx.quizAttempt.deleteMany({ where: { studentId, quiz: { lesson } } });
		await tx.lessonAssistantMessage.deleteMany({
			where: { conversation: { studentId, lesson } },
		});
		await tx.lessonAssistantConversation.deleteMany({
			where: { studentId, lesson },
		});
		await tx.conceptCheck.deleteMany({ where: { studentId, courseId } });
		await tx.learningPathCache.deleteMany({ where: { studentId, courseId } });
		await tx.enrollment.updateMany({
			where: { studentId, courseId },
			data: { progress: 0 },
		});
	},
};
