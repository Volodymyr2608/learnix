"use client";

import { BookOpen, Loader2 } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Separator } from "@/app/_components/_shared/ui/separator";
import QuestionCard from "@/app/_components/Quiz/QuestionCard";
import type { QuizPlayerProps } from "@/app/_components/Quiz/QuizPlayer/types";
import { api } from "@/trpc/client";

export default function QuizPlayer({ lessonId }: QuizPlayerProps) {
	const { data: quizzes, isLoading } = api.quiz.getByLesson.useQuery(lessonId, {
		enabled: !!lessonId,
	});

	if (isLoading) {
		return (
			<div className="flex justify-center py-6">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (!quizzes?.length) return null;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-2">
					<BookOpen className="h-5 w-5 text-muted-foreground" />
					<div>
						<CardTitle>Knowledge Check</CardTitle>
						<CardDescription>
							{quizzes.length} question{quizzes.length !== 1 ? "s" : ""}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{quizzes.map((quiz, i) => (
					<div key={quiz.id}>
						{i > 0 && <Separator className="mb-6" />}
						<QuestionCard index={i} lessonId={lessonId} quiz={quiz} />
					</div>
				))}
			</CardContent>
		</Card>
	);
}
