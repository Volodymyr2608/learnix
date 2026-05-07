import type { LessonFormData } from "../../types";

export interface LessonInfoCardProps {
	data: LessonFormData;
	onUpdate: (changes: Partial<LessonFormData>) => void;
}
