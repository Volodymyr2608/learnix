"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "app/_components/_shared/ui/card";
import { api } from "trpc/client";
import type { PathStep } from "@/server/services/learningPathAI/schemas/learningPath.schema";
import { EmptyStateCard } from "./components/EmptyStateCard";
import { PathStepRow } from "./components/PathStepRow";
import { RegenerateButton } from "./components/RegenerateButton";
import { StaleBanner } from "./components/StaleBanner";
import { WeakConceptChips } from "./components/WeakConceptChips";
import { useLearningPathGenerate } from "./hooks/useLearningPathGenerate";
import type { LearningPathCardProps } from "./types";

export const LearningPathCard = ({ courseId }: LearningPathCardProps) => {
	const { data, refetch, isLoading } = api.learningPath.getForCourse.useQuery({
		courseId,
	});
	const { isGenerating, progress, handleGenerate } = useLearningPathGenerate({
		courseId,
		onDone: refetch,
	});

	if (isLoading) return null;

	if (!data) {
		return (
			<EmptyStateCard
				isLoading={isGenerating}
				onGenerate={handleGenerate}
				progress={progress}
			/>
		);
	}

	const steps = data.steps as PathStep[];
	const weakConcepts = data.weakConcepts as string[];

	return (
		<Card className="gap-4">
			<CardHeader className="grid-rows-1">
				<CardTitle className="text-sm">Your Path</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1 pt-0">
				{data.staleAt && <StaleBanner />}
				<p className="text-muted-foreground text-xs">{data.summary}</p>
				<WeakConceptChips concepts={weakConcepts} />
				<ul className="mt-2 space-y-1">
					{steps.map((step, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: PathStep[] is positionally stable
						<li key={i}>
							<PathStepRow courseId={courseId} step={step} />
						</li>
					))}
				</ul>
				<RegenerateButton courseId={courseId} onDone={() => void refetch()} />
			</CardContent>
		</Card>
	);
};
