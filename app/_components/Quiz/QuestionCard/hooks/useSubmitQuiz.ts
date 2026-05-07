import { api } from "trpc/client";

export function useSubmitQuiz(lessonId: string) {
	const utils = api.useUtils();

	return api.quiz.submit.useMutation({
		onSuccess: () => {
			void utils.quiz.getByLesson.invalidate(lessonId);
		},
	});
}
