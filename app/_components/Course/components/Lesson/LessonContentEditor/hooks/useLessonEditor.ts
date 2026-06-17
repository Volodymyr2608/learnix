import { useState } from "react";
import { toast } from "sonner";
import type { LessonData } from "@/lib/requests/lesson/getLessonById";
import { api } from "@/trpc/client";
import { useLessonForm } from "./useLessonForm";
import { useLessonQuiz } from "./useLessonQuiz";
import { useLessonResources } from "./useLessonResources";

export const useLessonEditor = (initialLesson: LessonData) => {
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

	const form = useLessonForm(initialLesson);
	const resources = useLessonResources(initialLesson);
	const quiz = useLessonQuiz(initialLesson);

	const updateContent = api.lesson.updateContent.useMutation({
		onSuccess: () => {
			toast.success("Lesson saved successfully.");
			setLastSavedAt(new Date());
		},
		onError: (err) => toast.error(err.message),
	});

	const handleSave = () => {
		updateContent.mutate({
			id: initialLesson.id,
			title: form.lessonData.title,
			description: form.lessonData.description || null,
			durationMinutes: form.lessonData.durationMinutes ?? null,
			videoUrl: form.lessonData.videoUrl || null,
			content: form.lessonData.textContent || null,
			resources: resources.resources,
			quizzes: quiz.quizQuestions.map((q) => ({
				id: q.id,
				question: q.question,
				options: q.options.map((o) => o.text),
				correctAnswer: q.correctAnswer,
			})),
		});
	};

	return {
		...form,
		...resources,
		...quiz,
		isSaving: updateContent.isPending,
		lastSavedAt,
		handleSave,
	};
};
