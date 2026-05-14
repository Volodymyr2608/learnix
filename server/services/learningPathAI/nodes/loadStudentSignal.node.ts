import { CourseStatus } from "@/generated/prisma";
import { conceptMasteryRepository } from "@/server/repositories/conceptMastery.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { quizAttemptRepository } from "@/server/repositories/quizAttempt.repository";
import { CourseUnavailableError } from "../learningPathAI.errors";
import type { PathState } from "../learningPathAI.state";

export async function loadStudentSignal(
	state: PathState,
): Promise<Partial<PathState>> {
	const { studentId, courseId } = state;

	const [enrollment, lessonOrder, quizAttempts, mastery, completedLessonIds] =
		await Promise.all([
			enrollmentRepository.findByStudentCourse(studentId, courseId),
			lessonRepository.listOrderedWithConcepts(courseId),
			quizAttemptRepository.latestPerQuizForStudent(studentId, courseId),
			conceptMasteryRepository.byStudentCourse(studentId, courseId),
			lessonRepository.completedLessonIds(courseId, studentId),
		]);

	const course = enrollment?.course as
		| { deletedAt: Date | null; status: CourseStatus }
		| undefined;

	if (
		!enrollment ||
		course?.deletedAt ||
		course?.status !== CourseStatus.published
	) {
		throw new CourseUnavailableError(
			"Course not enrolled or unavailable",
			"BAD_REQUEST",
		);
	}

	return { completedLessonIds, lessonOrder, quizAttempts, mastery };
}