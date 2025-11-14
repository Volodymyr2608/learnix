"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/_components/_shared/ui/dialog";
import { Input } from "@/app/_components/_shared/ui/input";
import { Label } from "@/app/_components/_shared/ui/label";

interface DeleteCourseDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	courseTitle: string;
	courseId: number;
}

export function DeleteCourseDialog({
	open,
	onOpenChange,
	courseTitle,
}: DeleteCourseDialogProps) {
	const [confirmText, setConfirmText] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = async () => {
		if (confirmText !== "course") return;

		setIsDeleting(true);
		// Simulate API call
		await new Promise((resolve) => setTimeout(resolve, 1000));
		setIsDeleting(false);
		onOpenChange(false);
		setConfirmText("");
		// Show success message or redirect
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<div className="flex items-center gap-2">
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
							<AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
						</div>
						<DialogTitle>Delete Course</DialogTitle>
					</div>
					<DialogDescription className="pt-2">
						Are you sure you want to delete <strong>{courseTitle}</strong>? This
						action cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-4">
					<div className="rounded-lg bg-red-50 p-3 text-red-900 text-sm dark:bg-red-950 dark:text-red-100">
						This will permanently delete:
						<ul className="mt-2 list-inside list-disc space-y-1">
							<li>All course content and lessons</li>
							<li>Student enrollment data</li>
							<li>Reviews and ratings</li>
							<li>Revenue history</li>
						</ul>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirm">
							Type <strong>course</strong> to confirm deletion
						</Label>
						<Input
							id="confirm"
							onChange={(e) => setConfirmText(e.target.value)}
							placeholder="Type 'course' to confirm"
							value={confirmText}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={isDeleting}
						onClick={() => onOpenChange(false)}
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={confirmText !== "course" || isDeleting}
						onClick={handleDelete}
						variant="destructive"
					>
						{isDeleting ? "Deleting..." : "Delete Course"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
