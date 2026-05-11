import { useState } from "react";
import type { LessonData } from "@/lib/requests/lesson/getLessonById";
import type { LessonFormData } from "../types";

export const useLessonForm = (initialLesson: LessonData) => {
	const [lessonData, setLessonData] = useState<LessonFormData>(() => ({
		title: initialLesson.title,
		description: initialLesson.description ?? "",
		videoUrl: initialLesson.videoUrl ?? "",
		videoFile: null,
		duration: initialLesson.duration ?? "",
		textContent: initialLesson.content ?? "",
	}));

	const updateLessonData = (changes: Partial<LessonFormData>) => {
		setLessonData((prev) => ({ ...prev, ...changes }));
	};

	return { lessonData, updateLessonData };
};
