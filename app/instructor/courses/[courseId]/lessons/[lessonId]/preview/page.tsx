import {
	AlertCircle,
	BookOpen,
	ChevronLeft,
	Download,
	FileText,
	PlayCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/app/_components/_shared/ui/tabs";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import getCourseById from "@/lib/requests/course/getCourseById";
import getLessonById from "@/lib/requests/lesson/getLessonById";

type ResourceItem = { id: string; name: string; type: string; url: string };

export default async function InstructorLessonPreviewPage({
	params,
}: {
	params: Promise<{ courseId: string; lessonId: string }>;
}) {
	const { courseId, lessonId } = await params;

	const [lesson, course] = await Promise.all([
		getLessonById(lessonId),
		getCourseById(courseId),
	]);

	if (!lesson) {
		notFound();
	}

	const resources = Array.isArray(lesson.resources)
		? (lesson.resources as ResourceItem[])
		: [];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Button asChild size="icon" variant="ghost">
						<Link href={INSTRUCTOR_URLS.editLesson(courseId, lessonId)}>
							<ChevronLeft className="h-4 w-4" />
						</Link>
					</Button>
					<div>
						<h1 className="font-bold text-2xl tracking-tight">
							Preview: {lesson.title}
						</h1>
						<p className="text-muted-foreground text-sm">
							How students will see this lesson
						</p>
					</div>
				</div>
				<Button asChild variant="outline">
					<Link href={INSTRUCTOR_URLS.editLesson(courseId, lessonId)}>
						Edit Content
					</Link>
				</Button>
			</div>

			{/* Preview banner */}
			<Card className="border-primary/50 bg-primary/5">
				<CardContent className="pt-6">
					<div className="flex items-start gap-3">
						<AlertCircle className="mt-0.5 h-5 w-5 text-primary" />
						<div className="space-y-1">
							<p className="font-medium text-sm">Preview Mode</p>
							<p className="text-muted-foreground text-sm">
								This is how students will see this lesson. Changes made in the
								editor will be reflected here.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Content */}
			<div className="grid gap-6 lg:grid-cols-3">
				{/* Main column */}
				<div className="space-y-6 lg:col-span-2">
					{/* Video player */}
					<Card className="overflow-hidden">
						<div className="aspect-video w-full bg-black">
							{lesson.videoUrl ? (
								<video className="h-full w-full" controls>
									<track default kind="captions" src="" srcLang="en" />
									<source src={lesson.videoUrl} type="video/mp4" />
								</video>
							) : (
								<div className="flex h-full items-center justify-center">
									<div className="space-y-2 text-center">
										<PlayCircle className="mx-auto h-16 w-16 text-white/80" />
										<p className="text-sm text-white/60">
											No video uploaded yet
										</p>
									</div>
								</div>
							)}
						</div>
					</Card>

					{/* Tabs */}
					<Tabs className="w-full" defaultValue="overview">
						<TabsList className="grid w-full grid-cols-3">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="resources">Resources</TabsTrigger>
							<TabsTrigger value="quiz">Quiz</TabsTrigger>
						</TabsList>

						<TabsContent className="space-y-4" value="overview">
							<Card>
								<CardHeader>
									<CardTitle>{lesson.title}</CardTitle>
									{lesson.duration && (
										<CardDescription>{lesson.duration}</CardDescription>
									)}
								</CardHeader>
								<CardContent className="space-y-4">
									{lesson.description && (
										<p className="text-muted-foreground text-sm leading-relaxed">
											{lesson.description}
										</p>
									)}
									{lesson.content && (
										<>
											<Separator />
											<p className="whitespace-pre-wrap text-sm leading-relaxed">
												{lesson.content}
											</p>
										</>
									)}
									{!lesson.description && !lesson.content && (
										<p className="text-muted-foreground text-sm">
											No content added yet.
										</p>
									)}
								</CardContent>
							</Card>
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

						<TabsContent className="space-y-4" value="quiz">
							<Card>
								<CardHeader>
									<CardTitle>Lesson Quiz</CardTitle>
									<CardDescription>Test your understanding</CardDescription>
								</CardHeader>
								<CardContent className="space-y-6">
									{lesson.quizzes.length > 0 ? (
										lesson.quizzes.map((quiz, index) => (
											<div className="space-y-3" key={quiz.id}>
												<p className="font-medium">
													{index + 1}. {quiz.question}
												</p>
												<div className="space-y-2">
													{quiz.options.map((option) => (
														<div
															className={`rounded-lg border p-3 text-sm transition-colors ${
																option === quiz.correct
																	? "border-primary/50 bg-primary/5"
																	: ""
															}`}
															key={option}
														>
															{option}
														</div>
													))}
												</div>
											</div>
										))
									) : (
										<p className="py-4 text-center text-muted-foreground text-sm">
											No quiz questions added yet.
										</p>
									)}
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>
				</div>

				{/* Sidebar */}
				<div className="lg:col-span-1">
					<Card>
						<CardHeader>
							<CardTitle>Lesson Info</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								{course?.title && (
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">Course:</span>
										<span className="font-medium">{course.title}</span>
									</div>
								)}
								{lesson.duration && (
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">Duration:</span>
										<span className="font-medium">{lesson.duration}</span>
									</div>
								)}
								<div className="flex justify-between text-sm">
									<span className="text-muted-foreground">Resources:</span>
									<span className="font-medium">{resources.length}</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-muted-foreground">Quiz Questions:</span>
									<span className="font-medium">{lesson.quizzes.length}</span>
								</div>
							</div>
							<Separator />
							<div className="space-y-2">
								<Badge className="w-full justify-center" variant="secondary">
									Preview Mode
								</Badge>
								<p className="text-center text-muted-foreground text-xs">
									This preview shows how students will experience this lesson
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
