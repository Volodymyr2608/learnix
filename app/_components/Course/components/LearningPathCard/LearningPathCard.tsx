"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "app/_components/_shared/ui/card";
import { useState } from "react";
import { api } from "trpc/client";
import type { PathStep } from "@/server/services/learningPathAI/schemas/learningPath.schema";
import { EmptyStateCard } from "./components/EmptyStateCard";
import { PathStepRow } from "./components/PathStepRow";
import { RegenerateButton } from "./components/RegenerateButton";
import { StaleBanner } from "./components/StaleBanner";
import { WeakConceptChips } from "./components/WeakConceptChips";

type LearningPathCardProps = {
	courseId: string;
};

export function LearningPathCard({ courseId }: LearningPathCardProps) {
	const { data, refetch, isLoading } = api.learningPath.getForCourse.useQuery({
		courseId,
	});
	const [isGenerating, setIsGenerating] = useState(false);

	const handleGenerate = async () => {
		setIsGenerating(true);
		try {
			await fetch("/api/chat/learning-path", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ courseId }),
			});
			await refetch();
		} finally {
			setIsGenerating(false);
		}
	};

	if (isLoading) return null;

	if (!data) {
		return (
			<EmptyStateCard isLoading={isGenerating} onGenerate={handleGenerate} />
		);
	}

	const steps = data.steps as PathStep[];
	const weakConcepts = data.weakConcepts as string[];

	return (
		<Card>
			<CardHeader className="pb-2">
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
}
