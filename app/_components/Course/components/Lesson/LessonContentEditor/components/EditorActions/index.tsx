import { Eye, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/_components/_shared/ui/button";
import type { EditorActionsProps } from "./types";

export const EditorActions = ({
	courseId,
	lessonId,
	isSaving,
	onSave,
}: EditorActionsProps) => {
	const router = useRouter();

	return (
		<div className="flex items-center justify-between border-t pt-6">
			<Button asChild variant="outline">
				<a
					href={`/instructor/courses/${courseId}/lessons/${lessonId}/preview`}
					target="_blank"
				>
					<Eye className="mr-2 h-4 w-4" />
					Preview Lesson
				</a>
			</Button>
			<div className="flex gap-3">
				<Button onClick={() => router.back()} variant="outline">
					Cancel
				</Button>
				<Button disabled={isSaving} onClick={onSave}>
					<Save className="mr-2 h-4 w-4" />
					{isSaving ? "Saving…" : "Save Lesson"}
				</Button>
			</div>
		</div>
	);
};
