import { cn } from "lib/utils/cn";
import type { QuizWithAttempt } from "../types";

const OPTION_BASE =
	"w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors";

export function optionClassName(
	option: string,
	attempt: QuizWithAttempt["attempt"],
	selected: string | null,
	isLocked: boolean,
): string {
	if (isLocked && attempt) {
		if (attempt.selectedAnswer === option) {
			return cn(
				OPTION_BASE,
				"border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
			);
		}
		return cn(OPTION_BASE, "cursor-not-allowed opacity-60");
	}

	// Retry mode: highlight previous wrong answer in red, new selection in primary
	if (attempt && !attempt.isCorrect) {
		if (attempt.selectedAnswer === option && selected === option) {
			return cn(OPTION_BASE, "border-destructive bg-destructive/10 text-destructive");
		}
		if (selected === option) {
			return cn(OPTION_BASE, "border-primary bg-primary/10 text-primary");
		}
		return cn(OPTION_BASE, "hover:bg-muted");
	}

	return cn(
		OPTION_BASE,
		selected === option
			? "border-primary bg-primary/10 text-primary"
			: "hover:bg-muted",
	);
}
