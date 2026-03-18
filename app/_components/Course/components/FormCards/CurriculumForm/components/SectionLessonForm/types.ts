export type SectionLessonFormProps = {
	sectionIndex: number;
	sectionId: string;
	courseId?: string;
	removeSection: (index?: number | number[]) => void;
	isEdit?: boolean;
};
