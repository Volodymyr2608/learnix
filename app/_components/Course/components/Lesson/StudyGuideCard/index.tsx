"use client";

import { BookOpen } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Separator } from "@/app/_components/_shared/ui/separator";
import { ConceptList } from "@/app/_components/Course/components/Lesson/ConceptList";
import { GlossaryList } from "@/app/_components/Course/components/Lesson/GlossaryList";
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
					<ConceptList concepts={concepts} />
				</CollapsibleSection>

				{glossary.length > 0 && (
					<>
						<Separator />
						<CollapsibleSection title={`Glossary (${glossary.length})`}>
							<GlossaryList glossary={glossary} />
						</CollapsibleSection>
					</>
				)}
			</CardContent>
		</Card>
	);
};
