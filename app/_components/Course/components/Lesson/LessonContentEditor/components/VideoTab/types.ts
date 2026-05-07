import type { LessonFormData } from "../../types";

export interface VideoTabProps {
	videoUrl: LessonFormData["videoUrl"];
	videoFile: LessonFormData["videoFile"];
	onUpdate: (changes: Partial<LessonFormData>) => void;
}
