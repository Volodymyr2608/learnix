import type { SelectedCourse } from "@/app/_components/Course/components/BrowseCourses/components/BrowseCourseCard/types";

export type EnrollConfirmDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	course: SelectedCourse;
};
