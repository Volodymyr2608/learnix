"use client";

import {
	BookOpen,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Circle,
	Download,
	FileText,
	Loader2,
	MessageSquare,
	PlayCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import { Separator } from "@/app/_components/_shared/ui/separator";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/app/_components/_shared/ui/tabs";
import QuizPlayer from "@/app/_components/Quiz/QuizPlayer/QuizPlayer";
import type { StudentCourseData } from "@/lib/requests/course/getStudentCourse";
import { api } from "@/trpc/client";

type ResourceItem = { id: string; name: string; type: string; url: string };

function toFlatLessons(course: StudentCourseData) {
	return course.sections.flatMap((s) => s.lessons);
}

function findInitialLesson(course: StudentCourseData) {
	const flat = toFlatLessons(course);
	return flat.find((l) => !l.isCompleted)?.id ?? flat[0]?.id ?? "";
}

export default function CourseLearnView({
	course,
}: {
	course: StudentCourseData;
}) {
	const [completedIds, setCompletedIds] = useState<Set<string>>(
		() =>
			new Set(
				toFlatLessons(course)
					.filter((l) => l.isCompleted)
					.map((l) => l.id),
			),
	);
	const [selectedLessonId, setSelectedLessonId] = useState<string>(() =>
		findInitialLesson(course),
	);

	const allLessons = useMemo(() => toFlatLessons(course), [course]);
	const currentIndex = allLessons.findIndex((l) => l.id === selectedLessonId);
	const hasPrevious = currentIndex > 0;
	const hasNext = currentIndex < allLessons.length - 1;

	const progress = useMemo(
		() =>
			allLessons.length > 0
				? Math.round((completedIds.size / allLessons.length) * 100)
				: 0,
		[completedIds, allLessons],
	);

	const { data: lesson, isLoading: lessonLoading } =
		api.lesson.getStudentLesson.useQuery(selectedLessonId, {
			enabled: !!selectedLessonId,
		});

	const markComplete = api.lesson.markComplete.useMutation({
		onSuccess: () => {
			setCompletedIds((prev) => new Set([...prev, selectedLessonId]));
			const nextId = allLessons[currentIndex + 1]?.id;
			if (hasNext && nextId) setSelectedLessonId(nextId);
		},
	});

	const markIncomplete = api.lesson.markIncomplete.useMutation({
		onSuccess: () => {
			setCompletedIds((prev) => {
				const next = new Set(prev);
				next.delete(selectedLessonId);
				return next;
			});
		},
	});

	const isCompleting = markComplete.isPending || markIncomplete.isPending;
	const isCurrentCompleted = completedIds.has(selectedLessonId);

	const resources = Array.isArray(lesson?.resources)
		? (lesson.resources as ResourceItem[])
		: [];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Button asChild size="icon" variant="ghost">
						<a href="/dashboard/courses">
							<ChevronLeft className="h-4 w-4" />
						</a>
					</Button>
					<div>
						<h1 className="font-bold text-2xl tracking-tight">
							{course.title}
						</h1>
						<p className="text-muted-foreground text-sm">
							by {course.instructor}
						</p>
					</div>
				</div>
				<Badge variant="secondary">
					{completedIds.size}/{allLessons.length} Lessons
				</Badge>
			</div>

			<Card>
				<CardContent className="pt-6">
					<div className="space-y-2">
						<div className="flex items-center justify-between text-sm">
							<span className="font-medium">Course Progress</span>
							<span className="text-muted-foreground">
								{progress}% Complete
							</span>
						</div>
						<Progress className="h-2" value={progress} />
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="space-y-6 lg:col-span-2">
					<Card className="overflow-hidden">
						<div className="aspect-video w-full bg-black">
							{lessonLoading ? (
								<div className="flex h-full items-center justify-center">
									<Loader2 className="h-8 w-8 animate-spin text-white/60" />
								</div>
							) : lesson?.videoUrl ? (
								<video className="h-full w-full" controls>
									<track default kind="captions" src="" srcLang="en" />
									<source src={lesson.videoUrl} type="video/mp4" />
								</video>
							) : (
								<div className="flex h-full items-center justify-center">
									<PlayCircle className="h-16 w-16 text-white/80" />
								</div>
							)}
						</div>
					</Card>

					<Tabs className="w-full" defaultValue="overview">
						<TabsList className="grid w-full grid-cols-3">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="resources">Resources</TabsTrigger>
							<TabsTrigger value="discussion">Discussion</TabsTrigger>
						</TabsList>

						<TabsContent className="space-y-4" value="overview">
							<Card>
								<CardHeader>
									<div className="flex items-start justify-between">
										<div>
											<CardTitle>{lesson?.title ?? "Loading..."}</CardTitle>
											{lesson?.duration && (
												<CardDescription>
													Lesson {currentIndex + 1} of {allLessons.length} •{" "}
													{lesson.duration}
												</CardDescription>
											)}
										</div>
										{isCurrentCompleted ? (
											<Button
												disabled={isCompleting}
												onClick={() => markIncomplete.mutate(selectedLessonId)}
												size="sm"
												variant="outline"
											>
												{isCompleting ? (
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												) : (
													<CheckCircle2 className="mr-2 h-4 w-4 text-primary" />
												)}
												Completed
											</Button>
										) : (
											<Button
												disabled={isCompleting}
												onClick={() => markComplete.mutate(selectedLessonId)}
												size="sm"
											>
												{isCompleting ? (
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												) : (
													<Circle className="mr-2 h-4 w-4" />
												)}
												Mark Complete
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent className="space-y-4">
									{lesson?.description && (
										<p className="text-muted-foreground text-sm leading-relaxed">
											{lesson.description}
										</p>
									)}
									{lesson?.content && (
										<>
											<Separator />
											<p className="whitespace-pre-wrap text-sm leading-relaxed">
												{lesson.content}
											</p>
										</>
									)}
									{!lessonLoading &&
										!lesson?.description &&
										!lesson?.content && (
											<p className="text-muted-foreground text-sm">
												No content added yet.
											</p>
										)}
								</CardContent>
							</Card>

							<QuizPlayer lessonId={selectedLessonId} />
						</TabsContent>

						<TabsContent className="space-y-4" value="resources">
							<Card>
								<CardHeader>
									<CardTitle>Lesson Resources</CardTitle>
									<CardDescription>
										Download materials and code examples
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-3">
									{resources.length > 0 ? (
										resources.map((resource) => (
											<div
												className="flex items-center justify-between rounded-lg border p-3"
												key={resource.id}
											>
												<div className="flex items-center gap-3">
													{resource.type.toLowerCase() === "link" ? (
														<BookOpen className="h-5 w-5 text-muted-foreground" />
													) : (
														<FileText className="h-5 w-5 text-muted-foreground" />
													)}
													<div>
														<p className="font-medium text-sm">
															{resource.name}
														</p>
														<p className="text-muted-foreground text-xs uppercase">
															{resource.type}
														</p>
													</div>
												</div>
												<Button asChild size="sm" variant="ghost">
													<a
														href={resource.url}
														rel="noopener noreferrer"
														target="_blank"
													>
														<Download className="h-4 w-4" />
													</a>
												</Button>
											</div>
										))
									) : (
										<p className="py-4 text-center text-muted-foreground text-sm">
											No resources added yet.
										</p>
									)}
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent className="space-y-4" value="discussion">
							<Card>
								<CardHeader>
									<CardTitle>Discussion</CardTitle>
									<CardDescription>
										Ask questions and share insights
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center gap-3 rounded-lg border p-4">
										<MessageSquare className="h-5 w-5 text-muted-foreground" />
										<p className="text-muted-foreground text-sm">
											No discussions yet. Be the first to ask a question!
										</p>
									</div>
									<Button className="w-full">Start a Discussion</Button>
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>

					<div className="flex items-center justify-between">
						<Button
							disabled={!hasPrevious}
							onClick={() => {
								const prev = allLessons[currentIndex - 1];
								if (prev) setSelectedLessonId(prev.id);
							}}
							variant="outline"
						>
							<ChevronLeft className="mr-2 h-4 w-4" />
							Previous Lesson
						</Button>
						<Button
							disabled={!hasNext}
							onClick={() => {
								const next = allLessons[currentIndex + 1];
								if (next) setSelectedLessonId(next.id);
							}}
						>
							Next Lesson
							<ChevronRight className="ml-2 h-4 w-4" />
						</Button>
					</div>
				</div>

				<div className="lg:col-span-1">
					<Card>
						<CardHeader>
							<CardTitle>Course Content</CardTitle>
							<CardDescription>
								{completedIds.size} of {allLessons.length} lessons completed
							</CardDescription>
						</CardHeader>
						<CardContent className="p-0">
							<div className="max-h-[600px] overflow-y-auto p-6">
								<div className="space-y-4">
									{course.sections.map((section) => (
										<div key={section.id}>
											<p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
												{section.title}
											</p>
											<div className="space-y-1">
												{section.lessons.map((lesson) => {
													const isCompleted = completedIds.has(lesson.id);
													const isCurrent = lesson.id === selectedLessonId;

													return (
														<button
															className={`flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors ${
																isCurrent
																	? "bg-primary/10 text-primary"
																	: "hover:bg-muted"
															}`}
															key={lesson.id}
															onClick={() => setSelectedLessonId(lesson.id)}
															type="button"
														>
															{isCompleted ? (
																<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
															) : (
																<Circle
																	className={`mt-0.5 h-5 w-5 shrink-0 ${
																		isCurrent
																			? "text-primary"
																			: "text-muted-foreground"
																	}`}
																/>
															)}
															<div className="flex-1 space-y-0.5">
																<p
																	className={`font-medium text-sm leading-tight ${
																		isCurrent ? "text-primary" : ""
																	}`}
																>
																	{lesson.title}
																</p>
																{lesson.duration && (
																	<p className="text-muted-foreground text-xs">
																		{lesson.duration}
																	</p>
																)}
															</div>
														</button>
													);
												})}
											</div>
										</div>
									))}
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
