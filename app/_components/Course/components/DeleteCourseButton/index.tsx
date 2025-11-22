"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import type { DeleteCourseButtonProps } from "@/app/_components/Course/components/DeleteCourseButton/types";
import { DeleteCourseDialog } from "@/app/_components/Course/components/DeleteCourseDialog";

const DeleteCourseButton = ({ course }: DeleteCourseButtonProps) => {
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [courseToDelete, setCourseToDelete] = useState<{
		id: string;
		title: string;
	} | null>(null);

	return (
		<>
			<Button
				onClick={() => {
					setCourseToDelete({ id: course.id, title: course.title });
					setDeleteDialogOpen(true);
				}}
				size="icon"
				variant="outline"
			>
				<Trash2 className="h-4 w-4 text-red-600" />
			</Button>

			{/* Delete Confirmation Dialog */}
			{courseToDelete && (
				<DeleteCourseDialog
					courseId={courseToDelete.id}
					courseTitle={courseToDelete.title}
					onOpenChange={setDeleteDialogOpen}
					open={deleteDialogOpen}
				/>
			)}
		</>
	);
};

export default DeleteCourseButton;
