import { useState } from "react";
import { toast } from "sonner";
import type { EditableQuestion } from "@/app/_components/Quiz/GenerateQuizDialog/types";
import type { LessonData } from "@/lib/requests/lesson/getLessonById";
import { api } from "@/trpc/client";
import type {
	LessonFormData,
	QuizOption,
	QuizQuestion,
	Resource,
} from "../types";

const makeOptionId = (questionId: string, index: number) =>
	`${questionId}-opt-${index}`;

const makeNewOptions = (base: string): QuizOption[] =>
	Array.from({ length: 4 }, (_, i) => ({
		id: `${base}-opt-${i}`,
		text: "",
	}));

export function useLessonEditor(initialLesson: LessonData) {
	const [lessonData, setLessonData] = useState<LessonFormData>(() => ({
		title: initialLesson.title,
		description: initialLesson.description ?? "",
		videoUrl: initialLesson.videoUrl ?? "",
		videoFile: null,
		duration: initialLesson.duration ?? "",
		textContent: initialLesson.content ?? "",
	}));

	const [resources, setResources] = useState<Resource[]>(() =>
		Array.isArray(initialLesson.resources)
			? (initialLesson.resources as Resource[])
			: [],
	);

	const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(() =>
		initialLesson.quizzes.map((q) => ({
			id: q.id,
			question: q.question,
			options: q.options.map((text, i) => ({
				id: makeOptionId(q.id, i),
				text,
			})),
			correctAnswer: Math.max(0, q.options.indexOf(q.correct)),
		})),
	);

	const updateContent = api.lesson.updateContent.useMutation({
		onSuccess: () => toast.success("Lesson saved successfully."),
		onError: (err) => toast.error(err.message),
	});

	const updateLessonData = (changes: Partial<LessonFormData>) => {
		setLessonData((prev) => ({ ...prev, ...changes }));
	};

	const addResource = () => {
		setResources((prev) => [
			...prev,
			{
				id: Date.now().toString(),
				name: "New Resource",
				type: "PDF",
				url: "#",
			},
		]);
	};

	const removeResource = (id: string) => {
		setResources((prev) => prev.filter((r) => r.id !== id));
	};

	const updateResource = (id: string, changes: Partial<Resource>) => {
		setResources((prev) =>
			prev.map((r) => (r.id === id ? { ...r, ...changes } : r)),
		);
	};

	const addQuizQuestion = () => {
		const base = `new-${Date.now()}`;
		setQuizQuestions((prev) => [
			...prev,
			{ question: "", options: makeNewOptions(base), correctAnswer: 0 },
		]);
	};

	const removeQuizQuestion = (index: number) => {
		setQuizQuestions((prev) => prev.filter((_, i) => i !== index));
	};

	const updateQuiz = (index: number, changes: Partial<QuizQuestion>) => {
		setQuizQuestions((prev) =>
			prev.map((q, i) => (i === index ? { ...q, ...changes } : q)),
		);
	};

	const replaceQuizFromGenerated = (generated: EditableQuestion[]) => {
		setQuizQuestions(
			generated.map((q) => ({
				question: q.question,
				options: q.options.map((text, i) => ({
					id: `${q.id}-opt-${i}`,
					text,
				})),
				correctAnswer: q.correctIndex,
			})),
		);
	};

	const updateQuizOption = (qIndex: number, optionId: string, text: string) => {
		setQuizQuestions((prev) =>
			prev.map((q, i) => {
				if (i !== qIndex) return q;
				return {
					...q,
					options: q.options.map((o) =>
						o.id === optionId ? { ...o, text } : o,
					),
				};
			}),
		);
	};

	const handleSave = () => {
		updateContent.mutate({
			id: initialLesson.id,
			title: lessonData.title,
			description: lessonData.description || null,
			duration: lessonData.duration || null,
			videoUrl: lessonData.videoUrl || null,
			content: lessonData.textContent || null,
			resources,
			quizzes: quizQuestions.map((q) => ({
				id: q.id,
				question: q.question,
				options: q.options.map((o) => o.text),
				correctAnswer: q.correctAnswer,
			})),
		});
	};

	return {
		lessonData,
		updateLessonData,
		resources,
		addResource,
		removeResource,
		updateResource,
		quizQuestions,
		addQuizQuestion,
		removeQuizQuestion,
		updateQuiz,
		updateQuizOption,
		replaceQuizFromGenerated,
		isSaving: updateContent.isPending,
		handleSave,
	};
}
