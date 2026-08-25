export type DeleteCourseDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	courseTitle: string;
	courseId: string;
};
