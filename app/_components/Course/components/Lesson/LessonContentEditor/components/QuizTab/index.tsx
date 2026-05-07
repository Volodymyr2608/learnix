"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";
import { Label } from "@/app/_components/_shared/ui/label";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import { GenerateQuizDialog } from "@/app/_components/Quiz/GenerateQuizDialog";
import type { QuizTabProps } from "./types";

export const QuizTab = ({
	lessonId,
	questions,
	onAdd,
	onRemove,
	onUpdate,
	onUpdateOption,
}: QuizTabProps) => {
	const [generateOpen, setGenerateOpen] = useState(false);

	return (
		<>
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Lesson Quiz</CardTitle>
							<CardDescription>
								Add quiz questions to test student understanding
							</CardDescription>
						</div>
						<div className="flex gap-2">
							<Button
								onClick={() => setGenerateOpen(true)}
								size="sm"
								variant="outline"
							>
								<Sparkles className="mr-2 h-4 w-4" />
								Generate with AI
							</Button>
							<Button onClick={onAdd} size="sm">
								<Plus className="mr-2 h-4 w-4" />
								Add Question
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className="space-y-6">
						{questions.map((question, qIndex) => (
							<div
								className="space-y-4 rounded-lg border p-4"
								key={question.id ?? `new-${qIndex}`}
							>
								<div className="flex items-start justify-between">
									<Label className="font-semibold text-base">
										Question {qIndex + 1}
									</Label>
									<Button
										onClick={() => onRemove(qIndex)}
										size="icon"
										variant="ghost"
									>
										<Trash2 className="h-4 w-4 text-destructive" />
									</Button>
								</div>
								<Textarea
									onChange={(e) =>
										onUpdate(qIndex, { question: e.target.value })
									}
									placeholder="Enter your question"
									rows={2}
									value={question.question}
								/>
								<div className="space-y-2">
									<Label className="text-sm">Answer Options</Label>
									{question.options.map((option, optionIndex) => (
										<div className="flex items-center gap-2" key={option.id}>
											<input
												checked={question.correctAnswer === optionIndex}
												className="h-4 w-4"
												name={`correct-${question.id ?? qIndex}`}
												onChange={() =>
													onUpdate(qIndex, { correctAnswer: optionIndex })
												}
												type="radio"
											/>
											<Input
												onChange={(e) =>
													onUpdateOption(qIndex, option.id, e.target.value)
												}
												placeholder={`Option ${optionIndex + 1}`}
												value={option.text}
											/>
										</div>
									))}
									<p className="text-muted-foreground text-xs">
										Select the radio button to mark the correct answer
									</p>
								</div>
							</div>
						))}
						{questions.length === 0 && (
							<div className="py-8 text-center text-muted-foreground">
								No quiz questions added yet. Click "Add Question" to get
								started.
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			{generateOpen && (
				<GenerateQuizDialog
					lessonId={lessonId}
					onOpenChange={setGenerateOpen}
					open={generateOpen}
				/>
			)}
		</>
	);
};
