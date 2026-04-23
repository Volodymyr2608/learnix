"use client";

import {
	Download,
	Eye,
	FileText,
	HelpCircle,
	Plus,
	Save,
	Trash2,
	Upload,
	Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/app/_components/_shared/ui/tabs";
import { Textarea } from "@/app/_components/_shared/ui/textarea";

interface LessonContentEditorProps {
	courseId: string;
	lessonId: string;
}

export function LessonContentEditor({
	courseId,
	lessonId,
}: LessonContentEditorProps) {
	const router = useRouter();
	const [isSaving, setIsSaving] = useState(false);

	// Mock data - in real app, this would be fetched
	const [lessonData, setLessonData] = useState({
		title: "Introduction to HTML",
		description: "Learn the basics of HTML",
		videoUrl: "",
		videoFile: null as File | null,
		duration: "15:30",
		textContent: "",
		resources: [] as { id: string; name: string; type: string; url: string }[],
		quiz: {
			questions: [] as {
				id: string;
				question: string;
				options: string[];
				correctAnswer: number;
			}[],
		},
	});

	const [resources, setResources] = useState([
		{ id: "1", name: "HTML Cheat Sheet.pdf", type: "PDF", url: "#" },
		{ id: "2", name: "Code Examples.zip", type: "ZIP", url: "#" },
	]);

	const [quizQuestions, setQuizQuestions] = useState([
		{
			id: "1",
			question: "What does HTML stand for?",
			options: [
				"Hyper Text Markup Language",
				"Home Tool Markup Language",
				"Hyperlinks and Text Markup Language",
				"None of the above",
			],
			correctAnswer: 0,
		},
	]);

	const handleSave = async () => {
		setIsSaving(true);
		// Simulate save
		await new Promise((resolve) => setTimeout(resolve, 1000));
		setIsSaving(false);
		alert("Lesson content saved successfully!");
	};

	const addQuizQuestion = () => {
		setQuizQuestions([
			...quizQuestions,
			{
				id: Date.now().toString(),
				question: "",
				options: ["", "", "", ""],
				correctAnswer: 0,
			},
		]);
	};

	const removeQuizQuestion = (id: string) => {
		setQuizQuestions(quizQuestions.filter((q) => q.id !== id));
	};

	const addResource = () => {
		const newResource = {
			id: Date.now().toString(),
			name: "New Resource",
			type: "PDF",
			url: "#",
		};
		setResources([...resources, newResource]);
	};

	const removeResource = (id: string) => {
		setResources(resources.filter((r) => r.id !== id));
	};

	return (
		<div className="space-y-6">
			{/* Lesson Info */}
			<Card>
				<CardHeader>
					<CardTitle>Lesson Information</CardTitle>
					<CardDescription>Basic details about this lesson</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="lessonTitle">Lesson Title</Label>
							<Input
								id="lessonTitle"
								onChange={(e) =>
									setLessonData({ ...lessonData, title: e.target.value })
								}
								placeholder="Enter lesson title"
								value={lessonData.title}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="duration">Duration (mm:ss)</Label>
							<Input
								id="duration"
								onChange={(e) =>
									setLessonData({ ...lessonData, duration: e.target.value })
								}
								placeholder="15:30"
								value={lessonData.duration}
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<Textarea
							id="description"
							onChange={(e) =>
								setLessonData({ ...lessonData, description: e.target.value })
							}
							placeholder="Brief description of what students will learn"
							rows={2}
							value={lessonData.description}
						/>
					</div>
				</CardContent>
			</Card>

			{/* Content Tabs */}
			<Tabs className="space-y-4" defaultValue="video">
				<TabsList className="grid w-full grid-cols-4">
					<TabsTrigger value="video">
						<Video className="mr-2 h-4 w-4" />
						Video
					</TabsTrigger>
					<TabsTrigger value="text">
						<FileText className="mr-2 h-4 w-4" />
						Text Content
					</TabsTrigger>
					<TabsTrigger value="resources">
						<Download className="mr-2 h-4 w-4" />
						Resources
					</TabsTrigger>
					<TabsTrigger value="quiz">
						<HelpCircle className="mr-2 h-4 w-4" />
						Quiz
					</TabsTrigger>
				</TabsList>

				{/* Video Tab */}
				<TabsContent value="video">
					<Card>
						<CardHeader>
							<CardTitle>Video Content</CardTitle>
							<CardDescription>
								Upload or link to video content for this lesson
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="videoUrl">
									Video URL (YouTube, Vimeo, etc.)
								</Label>
								<Input
									id="videoUrl"
									onChange={(e) =>
										setLessonData({ ...lessonData, videoUrl: e.target.value })
									}
									placeholder="https://youtube.com/watch?v=..."
									type="url"
									value={lessonData.videoUrl}
								/>
							</div>

							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<span className="w-full border-t" />
								</div>
								<div className="relative flex justify-center text-xs uppercase">
									<span className="bg-background px-2 text-muted-foreground">
										Or upload file
									</span>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="videoFile">Upload Video File</Label>
								<div className="flex items-center gap-2">
									<Input
										accept="video/*"
										id="videoFile"
										onChange={(e) => {
											if (e.target.files?.[0]) {
												setLessonData({
													...lessonData,
													videoFile: e.target.files?.[0] ?? null,
												});
											}
										}}
										type="file"
									/>
									<Button size="icon" variant="outline">
										<Upload className="h-4 w-4" />
									</Button>
								</div>
								<p className="text-muted-foreground text-sm">
									Supported formats: MP4, MOV, AVI (Max: 2GB)
								</p>
							</div>

							{lessonData.videoUrl && (
								<div className="rounded-lg border p-4">
									<p className="mb-2 font-medium text-sm">Video Preview</p>
									<div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
										<Video className="h-12 w-12 text-muted-foreground" />
									</div>
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				{/* Text Content Tab */}
				<TabsContent value="text">
					<Card>
						<CardHeader>
							<CardTitle>Text Content</CardTitle>
							<CardDescription>
								Add written content, notes, or transcripts for this lesson
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Textarea
								className="font-mono text-sm"
								onChange={(e) =>
									setLessonData({ ...lessonData, textContent: e.target.value })
								}
								placeholder="Write your lesson content here. You can include explanations, code examples, tips, etc."
								rows={15}
								value={lessonData.textContent}
							/>
							<p className="mt-2 text-muted-foreground text-sm">
								Supports Markdown formatting
							</p>
						</CardContent>
					</Card>
				</TabsContent>

				{/* Resources Tab */}
				<TabsContent value="resources">
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>Downloadable Resources</CardTitle>
									<CardDescription>
										Add files students can download (PDFs, code files, etc.)
									</CardDescription>
								</div>
								<Button onClick={addResource} size="sm">
									<Plus className="mr-2 h-4 w-4" />
									Add Resource
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{resources.map((resource) => (
									<div
										className="flex items-center gap-3 rounded-lg border p-4"
										key={resource.id}
									>
										<Download className="h-5 w-5 text-muted-foreground" />
										<div className="flex-1 space-y-1">
											<Input
												className="font-medium"
												onChange={(e) => {
													setResources(
														resources.map((r) =>
															r.id === resource.id
																? { ...r, name: e.target.value }
																: r,
														),
													);
												}}
												value={resource.name}
											/>
											<div className="flex gap-2">
												<Input
													className="w-24 text-sm"
													onChange={(e) => {
														setResources(
															resources.map((r) =>
																r.id === resource.id
																	? { ...r, type: e.target.value }
																	: r,
															),
														);
													}}
													placeholder="Type"
													value={resource.type}
												/>
												<Input className="text-sm" type="file" />
											</div>
										</div>
										<Button
											onClick={() => removeResource(resource.id)}
											size="icon"
											variant="ghost"
										>
											<Trash2 className="h-4 w-4 text-destructive" />
										</Button>
									</div>
								))}
								{resources.length === 0 && (
									<div className="py-8 text-center text-muted-foreground">
										No resources added yet. Click "Add Resource" to get started.
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				{/* Quiz Tab */}
				<TabsContent value="quiz">
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>Lesson Quiz</CardTitle>
									<CardDescription>
										Add quiz questions to test student understanding
									</CardDescription>
								</div>
								<Button onClick={addQuizQuestion} size="sm">
									<Plus className="mr-2 h-4 w-4" />
									Add Question
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<div className="space-y-6">
								{quizQuestions.map((question, qIndex) => (
									<div
										className="space-y-4 rounded-lg border p-4"
										key={question.id}
									>
										<div className="flex items-start justify-between">
											<Label className="font-semibold text-base">
												Question {qIndex + 1}
											</Label>
											<Button
												onClick={() => removeQuizQuestion(question.id)}
												size="icon"
												variant="ghost"
											>
												<Trash2 className="h-4 w-4 text-destructive" />
											</Button>
										</div>
										<Textarea
											onChange={(e) => {
												setQuizQuestions(
													quizQuestions.map((q) =>
														q.id === question.id
															? { ...q, question: e.target.value }
															: q,
													),
												);
											}}
											placeholder="Enter your question"
											rows={2}
											value={question.question}
										/>
										<div className="space-y-2">
											<Label className="text-sm">Answer Options</Label>
											{question.options.map((option, oIndex) => (
												<div className="flex items-center gap-2" key={option}>
													<input
														checked={question.correctAnswer === oIndex}
														className="h-4 w-4"
														name={`correct-${question.id}`}
														onChange={() => {
															setQuizQuestions(
																quizQuestions.map((q) =>
																	q.id === question.id
																		? { ...q, correctAnswer: oIndex }
																		: q,
																),
															);
														}}
														type="radio"
													/>
													<Input
														onChange={(e) => {
															setQuizQuestions(
																quizQuestions.map((q) => {
																	if (q.id === question.id) {
																		const newOptions = [...q.options];
																		newOptions[oIndex] = e.target.value;
																		return { ...q, options: newOptions };
																	}
																	return q;
																}),
															);
														}}
														placeholder={`Option ${oIndex + 1}`}
														value={option}
													/>
												</div>
											))}
											<p className="text-muted-foreground text-xs">
												Select the radio button to mark the correct answer
											</p>
										</div>
									</div>
								))}
								{quizQuestions.length === 0 && (
									<div className="py-8 text-center text-muted-foreground">
										No quiz questions added yet. Click "Add Question" to get
										started.
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			{/* Action Buttons */}
			<div className="flex items-center justify-between border-t pt-6">
				<Button asChild variant="outline">
					<a
						href={`/instructor/courses/${courseId}/lessons/${lessonId}/preview`}
						target="_blank"
					>
						<Eye className="mr-2 h-4 w-4" />
						Preview Lesson
					</a>
				</Button>
				<div className="flex gap-3">
					<Button onClick={() => router.back()} variant="outline">
						Cancel
					</Button>
					<Button disabled={isSaving} onClick={handleSave}>
						<Save className="mr-2 h-4 w-4" />
						{isSaving ? "Saving..." : "Save Lesson"}
					</Button>
				</div>
			</div>
		</div>
	);
}
