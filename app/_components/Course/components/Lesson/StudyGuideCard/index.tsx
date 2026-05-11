"use client";

import { BookOpen } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Separator } from "@/app/_components/_shared/ui/separator";
import type { StudyGuideCardProps } from "@/app/_components/Course/components/Lesson/StudyGuideCard/types";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { useStudyGuide } from "./hooks/useStudyGuide";

export const StudyGuideCard = ({ lessonId }: StudyGuideCardProps) => {
	const data = useStudyGuide(lessonId);

	if (!data) return null;

	const { summary, concepts, glossary } = data;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<BookOpen className="h-4 w-4" />
					Study Guide
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1 pt-0">
				<CollapsibleSection defaultOpen title="Summary">
					<p className="text-muted-foreground text-sm leading-relaxed">
						{summary}
					</p>
				</CollapsibleSection>

				<Separator />

				<CollapsibleSection title={`Key Concepts (${concepts.length})`}>
					<ul className="space-y-3">
						{concepts.map((c) => (
							<li key={c.name}>
								<p className="font-medium text-sm">{c.name}</p>
								<p className="text-muted-foreground text-xs">{c.explanation}</p>
							</li>
						))}
					</ul>
				</CollapsibleSection>

				{glossary.length > 0 && (
					<>
						<Separator />
						<CollapsibleSection title={`Glossary (${glossary.length})`}>
							<dl className="space-y-3">
								{glossary.map((g) => (
									<div key={g.term}>
										<dt className="font-medium text-sm">{g.term}</dt>
										<dd className="text-muted-foreground text-xs">
											{g.definition}
										</dd>
									</div>
								))}
							</dl>
						</CollapsibleSection>
					</>
				)}
			</CardContent>
		</Card>
	);
};
