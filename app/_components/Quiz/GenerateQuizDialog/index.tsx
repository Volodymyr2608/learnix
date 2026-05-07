"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/_components/_shared/ui/dialog";
import { GeneratingState } from "./components/GeneratingState";
import { QuestionEditor } from "./components/QuestionEditor";
import { isValid } from "./helpers/isValid";
import { useGenerateQuizDialog } from "./hooks/useGenerateQuizDialog";
import type { GenerateQuizDialogProps } from "./types";

export function GenerateQuizDialog({
	lessonId,
	open,
	onOpenChange,
}: GenerateQuizDialogProps) {
	const {
		questions,
		isSaving,
		handleRegenerate,
		handleSave,
		updateQuestion,
		updateOption,
	} = useGenerateQuizDialog({ lessonId, open, onOpenChange });

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Generate Quiz Questions</DialogTitle>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto">
					{!questions && <GeneratingState />}

					{questions && (
						<div className="space-y-6 py-2">
							{questions.map((q, qIndex) => (
								<div key={q.id}>
									{qIndex > 0 && (
										<div className="mb-6 border-t border-dashed" />
									)}
									<QuestionEditor
										disabled={isSaving}
										index={qIndex}
										onUpdateOption={updateOption}
										onUpdateQuestion={updateQuestion}
										question={q}
									/>
								</div>
							))}
						</div>
					)}
				</div>

				{questions && (
					<DialogFooter className="border-t pt-4">
						<Button
							disabled={isSaving}
							onClick={handleRegenerate}
							variant="outline"
						>
							<RefreshCw className="mr-2 h-4 w-4" />
							Regenerate
						</Button>
						<Button
							disabled={isSaving || !isValid(questions)}
							onClick={handleSave}
						>
							{isSaving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Saving…
								</>
							) : (
								"Save all"
							)}
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
