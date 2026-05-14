"use client";

import { BookOpen, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PathStep } from "@/server/services/learningPathAI/schemas/learningPath.schema";

type PathStepRowProps = {
	step: PathStep;
	courseId: string;
};

export function PathStepRow({ step, courseId }: PathStepRowProps) {
	const router = useRouter();

	const handleClick = () => {
		const url = `/dashboard/courses/${courseId}/learn/${step.lessonId}${
			step.type === "RETRY_QUIZ" && step.quizId
				? `?scrollTo=${step.quizId}`
				: ""
		}`;
		router.push(url);
	};

	const Icon = step.type === "NEW_LESSON" ? BookOpen : RefreshCw;

	const typeLabel =
		step.type === "NEW_LESSON"
			? "New"
			: step.type === "REVIEW_LESSON"
				? "Review"
				: "Retry quiz";

	return (
		<button
			className="flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted"
			onClick={handleClick}
			type="button"
		>
			<Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary text-xs">
						{typeLabel}
					</span>
					<p className="truncate font-medium text-sm">{step.title}</p>
				</div>
				<p className="mt-0.5 text-muted-foreground text-xs leading-snug">
					{step.reason}
				</p>
			</div>
		</button>
	);
}
