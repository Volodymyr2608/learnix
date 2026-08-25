import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { RouterOutputs } from "@/trpc/client";
import { api } from "@/trpc/server";

export type LessonData = NonNullable<RouterOutputs["lesson"]["getLesson"]>;

const getLessonById = async (lessonId: string): Promise<LessonData | null> => {
	return safeRequest(
		"lesson.getLessonById",
		async () => {
			const lesson = await api.lesson.getLesson(lessonId);
			return lesson as LessonData;
		},
		null,
	);
};

export default getLessonById;
