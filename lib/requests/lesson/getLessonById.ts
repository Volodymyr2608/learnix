import type { RouterOutputs } from "@/trpc/client";
import { api } from "@/trpc/server";

export type LessonData = NonNullable<RouterOutputs["lesson"]["getLesson"]>;

const getLessonById = async (lessonId: string): Promise<LessonData | null> => {
	try {
		const lesson = await api.lesson.getLesson(lessonId);
		return lesson as LessonData;
	} catch (error) {
		console.error("Error fetching lesson:", error);
		return null;
	}
};

export default getLessonById;
