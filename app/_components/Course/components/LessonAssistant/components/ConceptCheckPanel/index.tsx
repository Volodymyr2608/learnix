"use client";

import { Button } from "app/_components/_shared/ui/button";
import { CircleHelp } from "lucide-react";
import { useState } from "react";
import { useConceptCheck } from "../../hooks/useConceptCheck";
import { CheckOption } from "../CheckOption";
import type { ConceptCheckPanelProps } from "./types";
import {
	isLocked,
	isSubmitDisabled,
	selectedOptionIndex,
	shouldRenderPanel,
} from "./utils";

/**
 * The panel a student answers a concept check in.
 *
 * It renders only when a check is actually open, and it disappears once the
 * answer is in — the tutor asks at most one question at a time, and a stale
 * panel would invite a second submission the server would refuse anyway.
 *
 * The question, like the options, is plain text. Nothing here is markdown.
 */
export const ConceptCheckPanel = ({ lessonId }: ConceptCheckPanelProps) => {
	const { check, isLoading, submit, isSubmitting, result } =
		useConceptCheck(lessonId);
	const [selected, setSelected] = useState<string | null>(null);

	if (!shouldRenderPanel(isLoading, check)) return null;
	if (!check) return null;

	const locked = isLocked(isSubmitting, result);

	const handleSubmit = () => {
		const optionIndex = selectedOptionIndex(check.options, selected);
		if (optionIndex < 0) return;
		submit({ checkId: check.id, optionIndex });
	};

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
			<div className="flex items-center gap-2 font-medium text-sm">
				<CircleHelp className="h-4 w-4" />
				Quick check: {check.concept}
			</div>

			<p className="text-sm">{check.question}</p>

			<div className="flex flex-col gap-2">
				{check.options.map((option) => (
					<CheckOption
						isLocked={locked}
						isSelected={selected === option}
						key={option}
						onSelect={setSelected}
						option={option}
					/>
				))}
			</div>

			{!result && (
				<Button
					className="self-start"
					disabled={isSubmitDisabled(selected, locked)}
					onClick={handleSubmit}
					size="sm"
				>
					Submit answer
				</Button>
			)}

			{result?.isCorrect === true && (
				<p className="text-green-700 text-sm dark:text-green-300">
					Correct — that concept is now recorded as applied.
				</p>
			)}
			{result?.isCorrect === false && (
				<p className="text-muted-foreground text-sm">
					Not quite. The answer was: {result.correctOption}
				</p>
			)}
		</div>
	);
};
