"use client";

import {
	AlertTriangle,
	BookOpen,
	CheckCircle2,
	Lightbulb,
	Loader2,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Separator } from "@/app/_components/_shared/ui/separator";
import { useStudyGuideToolbar } from "./hooks/useStudyGuideToolbar";
import type {
	GenerateButtonContentProps,
	StudyGuideToolbarProps,
} from "./types";

const GenerateButtonContent = ({
	isGenerating,
	hasInsights,
}: GenerateButtonContentProps) => {
	if (isGenerating) {
		return (
			<>
				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				Generating…
			</>
		);
	}
	if (hasInsights) {
		return (
			<>
				<RefreshCw className="mr-2 h-4 w-4" />
				Regenerate
			</>
		);
	}
	return (
		<>
			<Sparkles className="mr-2 h-4 w-4" />
			Generate study guide
		</>
	);
};

export const StudyGuideToolbar = ({
	lessonId,
	lastSavedAt,
}: StudyGuideToolbarProps) => {
	const {
		insights,
		isStale,
		conceptCount,
		glossaryCount,
		isGenerating,
		handleGenerate,
	} = useStudyGuideToolbar(lessonId, lastSavedAt);

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2 text-base">
						<BookOpen className="h-4 w-4" />
						Study Guide
					</CardTitle>

					{insights && !isStale && (
						<span className="flex items-center gap-1 text-muted-foreground text-xs">
							<CheckCircle2 className="h-3 w-3 text-green-500" />
							Last generated{" "}
							{new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
								Math.round(
									(new Date(insights.generatedAt).getTime() - Date.now()) /
										60000,
								),
								"minute",
							)}
						</span>
					)}

					{isStale && (
						<Badge className="gap-1" variant="secondary">
							<AlertTriangle className="h-3 w-3" />
							Content changed — regenerate to update
						</Badge>
					)}
				</div>

				{!insights && (
					<CardDescription className="flex items-start gap-2 pt-1">
						<Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
						Generates a summary, key concepts, and glossary from your lesson
						content. Add text in the Text Content tab first, save, then
						generate.
					</CardDescription>
				)}
			</CardHeader>

			<CardContent className="space-y-4">
				{insights ? (
					<>
						<p className="text-muted-foreground text-sm leading-relaxed">
							{insights.summary.length > 180
								? `${insights.summary.slice(0, 180)}…`
								: insights.summary}
						</p>

						<div className="flex flex-wrap items-center gap-2">
							<Badge className="gap-1.5" variant="secondary">
								<Sparkles className="h-3 w-3" />
								{conceptCount} key concept{conceptCount !== 1 ? "s" : ""}
							</Badge>
							{glossaryCount > 0 && (
								<Badge className="gap-1.5" variant="secondary">
									{glossaryCount} glossary term{glossaryCount !== 1 ? "s" : ""}
								</Badge>
							)}
						</div>

						<Separator />
					</>
				) : (
					<p className="text-muted-foreground text-sm italic">
						No study guide generated yet.
					</p>
				)}

				<Button
					disabled={isGenerating}
					onClick={handleGenerate}
					size="sm"
					variant="outline"
				>
					<GenerateButtonContent
						hasInsights={Boolean(insights)}
						isGenerating={isGenerating}
					/>
				</Button>
			</CardContent>
		</Card>
	);
};
