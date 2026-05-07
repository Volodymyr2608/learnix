import type { RouterOutputs } from "@/trpc/client";
import { api } from "@/trpc/server";

export type StudentLessonData = NonNullable<
	RouterOutputs["lesson"]["getStudentLesson"]
>;

const getStudentLesson = async (
	lessonId: string,
): Promise<StudentLessonData | null> => {
	try {
		const lesson = await api.lesson.getStudentLesson(lessonId);
		return lesson ?? null;
	} catch (error) {
		console.error("Error fetching student lesson:", error);
		return null;
	}
};

export default getStudentLesson;
