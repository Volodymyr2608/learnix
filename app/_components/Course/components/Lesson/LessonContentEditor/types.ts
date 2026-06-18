import type { LessonData } from "@/lib/requests/lesson/getLessonById";

export type LessonContentEditorProps = {
	courseId: string;
	initialLesson: LessonData;
};

export type LessonFormData = {
	title: string;
	description: string;
	videoUrl: string;
	videoFile: File | null;
	durationMinutes: number | null;
	textContent: string;
};

export type Resource = {
	id: string;
	name: string;
	type: string;
	url: string;
};

export type QuizOption = {
	id: string;
	text: string;
};

export type QuizQuestion = {
	id?: string;
	question: string;
	options: QuizOption[];
	correctAnswer: number;
};
