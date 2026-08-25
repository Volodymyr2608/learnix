import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { RouterOutputs } from "@/trpc/client";
import { api } from "@/trpc/server";

export type StudentLessonData = NonNullable<
	RouterOutputs["lesson"]["getStudentLesson"]
>;

const getStudentLesson = async (
	lessonId: string,
): Promise<StudentLessonData | null> => {
	return safeRequest(
		"lesson.getStudentLesson",
		async () => {
			const lesson = await api.lesson.getStudentLesson(lessonId);
			return lesson ?? null;
		},
		null,
	);
};

export default getStudentLesson;
