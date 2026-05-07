import { Input } from "@/app/_components/_shared/ui/input";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import { OPTION_KEYS } from "../../constants/optionKeys";
import type { QuestionEditorProps } from "./types";

export function QuestionEditor({
	question,
	index,
	disabled,
	onUpdateQuestion,
	onUpdateOption,
}: QuestionEditorProps) {
	return (
		<div className="space-y-3">
			<p className="font-medium text-sm">Question {index + 1}</p>
			<Textarea
				disabled={disabled}
				onChange={(e) =>
					onUpdateQuestion(question.id, { question: e.target.value })
				}
				placeholder="Question text"
				rows={2}
				value={question.question}
			/>
			<div className="space-y-2">
				{question.options.map((opt, optIndex) => (
					<div className="flex items-center gap-2" key={OPTION_KEYS[optIndex]}>
						<input
							checked={question.correctIndex === optIndex}
							className="h-4 w-4 shrink-0"
							disabled={disabled}
							name={`correct-${question.id}`}
							onChange={() =>
								onUpdateQuestion(question.id, { correctIndex: optIndex })
							}
							type="radio"
						/>
						<Input
							disabled={disabled}
							onChange={(e) =>
								onUpdateOption(question.id, optIndex, e.target.value)
							}
							placeholder={`Option ${optIndex + 1}`}
							value={opt}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
