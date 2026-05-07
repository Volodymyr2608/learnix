import type { RouterOutputs } from "trpc/client";

export type QuizWithAttempt = RouterOutputs["quiz"]["getByLesson"][number];
export type Attempt = NonNullable<QuizWithAttempt["attempt"]>;

export type QuestionCardProps = {
	quiz: QuizWithAttempt;
	index: number;
	lessonId: string;
};
