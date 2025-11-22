import {
	AlertCircle,
	BookOpen,
	CheckCircle2,
	ChevronLeft,
	Download,
	FileText,
	PlayCircle,
} from "lucide-react";
import Link from "next/link";
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

interface PreviewPageProps {
	params: Promise<{
		courseId: string;
		lessonId: string;
	}>;
}

export default async function InstructorLessonPreviewPage({
	params,
}: PreviewPageProps) {
	const { courseId, lessonId } = await params;

	// Mock lesson data - in real app, fetch from database
	const lesson = {
		id: lessonId,
		title: "Context API Deep Dive",
		duration: "20:15",
		videoUrl: "",
		content: `In this lesson, we'll explore the Context API in depth and learn how to use it effectively for state management in React applications. You'll understand when to use Context, how to optimize performance, and common patterns for organizing your context providers.`,
		learningPoints: [
			"Understanding Context API fundamentals",
			"Creating and consuming context",
			"Performance optimization techniques",
			"Best practices and common pitfalls",
		],
		resources: [
			{ name: "Lesson Notes.pdf", size: "2.4 MB", type: "pdf" },
			{ name: "Code Examples.zip", size: "1.8 MB", type: "zip" },
			{ name: "Additional Reading", type: "link" },
		],
		quiz: {
			questions: [
				{
					question: "What is the main purpose of React Context?",
					options: [
						"To manage component state",
						"To share data across the component tree without prop drilling",
						"To handle side effects",
						"To optimize rendering",
					],
					correctAnswer: 1,
				},
				{
					question: "When should you use Context API?",
					options: [
						"For all state management",
						"Only for global theme or authentication",
						"For data that needs to be accessible by many components at different nesting levels",
						"Never, always use Redux",
					],
					correctAnswer: 2,
				},
			],
		},
	};

	const course = {
		title: "Advanced React Patterns",
		instructor: "Sarah Johnson",
	};

	return (
		<div className="space-y-6">
			{/* Preview Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Button asChild size="icon" variant="ghost">
						<Link href={`/instructor/courses/${courseId}/edit`}>
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
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link href={INSTRUCTOR_URLS.editLesson(courseId, lessonId)}>
							Edit Content
						</Link>
					</Button>
				</div>
			</div>

			{/* Preview Mode Alert */}
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

			{/* Preview Content - Mimics Student View */}
			<div className="grid gap-6 lg:grid-cols-3">
				{/* Video Player & Content */}
				<div className="space-y-6 lg:col-span-2">
					{/* Video Player */}
					<Card className="overflow-hidden">
						<div className="aspect-video w-full bg-black">
							{lesson.videoUrl ? (
								<video className="h-full w-full" controls>
									<track
										default
										kind="captions"
										src="SUBTITLE_PATH"
										srcLang="en"
									/>
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

					{/* Lesson Content */}
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
									<CardDescription>
										Lesson {lessonId} • {lesson.duration}
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<p className="text-muted-foreground text-sm leading-relaxed">
										{lesson.content || "No lesson description added yet."}
									</p>
									{lesson.learningPoints.length > 0 && (
										<>
											<Separator />
											<div className="space-y-2">
												<h4 className="font-semibold">What you'll learn:</h4>
												<ul className="space-y-1 text-muted-foreground text-sm">
													{lesson.learningPoints.map((point) => (
														<li className="flex items-start gap-2" key={point}>
															<CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
															<span>{point}</span>
														</li>
													))}
												</ul>
											</div>
										</>
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
									{lesson.resources.length > 0 ? (
										lesson.resources.map((resource) => (
											<div
												className="flex items-center justify-between rounded-lg border p-3"
												key={resource.name}
											>
												<div className="flex items-center gap-3">
													{resource.type === "link" ? (
														<BookOpen className="h-5 w-5 text-muted-foreground" />
													) : (
														<FileText className="h-5 w-5 text-muted-foreground" />
													)}
													<div>
														<p className="font-medium text-sm">
															{resource.name}
														</p>
														{resource.size && (
															<p className="text-muted-foreground text-xs">
																{resource.size}
															</p>
														)}
													</div>
												</div>
												<Button size="sm" variant="ghost">
													<Download className="h-4 w-4" />
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
									{lesson.quiz.questions.length > 0 ? (
										lesson.quiz.questions.map((q, index) => (
											<div className="space-y-3" key={q.question}>
												<p className="font-medium">
													{index + 1}. {q.question}
												</p>
												<div className="space-y-2">
													{q.options.map((option, optIndex) => (
														<div
															className={`cursor-pointer rounded-lg border p-3 transition-colors hover:bg-muted ${
																optIndex === q.correctAnswer
																	? "border-primary/50 bg-primary/5"
																	: ""
															}`}
															key={option}
														>
															<p className="text-sm">{option}</p>
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

				{/* Info Sidebar */}
				<div className="lg:col-span-1">
					<Card>
						<CardHeader>
							<CardTitle>Lesson Info</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<div className="flex justify-between text-sm">
									<span className="text-muted-foreground">Course:</span>
									<span className="font-medium">{course.title}</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-muted-foreground">Instructor:</span>
									<span className="font-medium">{course.instructor}</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-muted-foreground">Duration:</span>
									<span className="font-medium">{lesson.duration}</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-muted-foreground">Resources:</span>
									<span className="font-medium">{lesson.resources.length}</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-muted-foreground">Quiz Questions:</span>
									<span className="font-medium">
										{lesson.quiz.questions.length}
									</span>
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
