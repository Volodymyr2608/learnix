"use client";

import { Button } from "app/_components/_shared/ui/button";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import AttemptBadge from "./components/AttemptBadge";
import { optionClassName } from "./helpers/optionClassName";
import { useSubmitQuiz } from "./hooks/useSubmitQuiz";
import type { QuestionCardProps } from "./types";

export default function QuestionCard({
	quiz,
	index,
	lessonId,
}: QuestionCardProps) {
	const [selected, setSelected] = useState<string | null>(
		quiz.attempt?.selectedAnswer ?? null,
	);

	const submit = useSubmitQuiz(lessonId);

	const { attempt } = quiz;
	const isLocked = !!attempt && attempt.isCorrect;
	const isShowingWrongAnswer =
		!!attempt && !attempt.isCorrect && selected === attempt.selectedAnswer;

	return (
		<div className="space-y-3">
			<p className="font-medium text-sm">
				{index + 1}. {quiz.question}
			</p>

			<div className="space-y-2">
				{quiz.options.map((option) => (
					<button
						className={optionClassName(option, attempt, selected, isLocked)}
						disabled={isLocked}
						key={option}
						onClick={() => setSelected(option)}
						type="button"
					>
						{option}
					</button>
				))}
			</div>

			<div className="flex items-center justify-between">
				{attempt && (isLocked || isShowingWrongAnswer) ? <AttemptBadge attempt={attempt} /> : <span />}

				<Button
					disabled={isShowingWrongAnswer ? false : !selected || isLocked || submit.isPending}
					onClick={() => {
						if (isShowingWrongAnswer) {
							setSelected(null);
							return;
						}
						if (!selected) return;
						submit.mutate({ quizId: quiz.id, selectedAnswer: selected });
					}}
					size="sm"
				>
					{submit.isPending && <Loader2 className="animate-spin" />}
					{isShowingWrongAnswer ? "Try Again" : "Submit"}
				</Button>
			</div>
		</div>
	);
}
