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

type Lesson = {
	id: number;
	title: string;
	duration: string;
	type: "video" | "exercise";
	description: string;
	learningPoints: string[];
};

const initialLessons: Lesson[] = [
	{
		id: 1,
		title: "Introduction to Advanced Patterns",
		duration: "12:30",
		type: "video",
		description:
			"Get started with advanced React patterns. This lesson covers the fundamentals and sets the stage for more complex patterns you'll learn throughout the course.",
		learningPoints: [
			"Overview of advanced React patterns",
			"When to use different patterns",
			"Setting up the development environment",
			"Course structure and prerequisites",
		],
	},
	{
		id: 2,
		title: "Higher-Order Components",
		duration: "18:45",
		type: "video",
		description:
			"Learn about Higher-Order Components (HOCs), a powerful pattern for reusing component logic. Understand how to create, compose, and debug HOCs effectively.",
		learningPoints: [
			"Understanding HOC fundamentals",
			"Creating reusable HOCs",
			"Composing multiple HOCs",
			"Common pitfalls and debugging tips",
		],
	},
	{
		id: 3,
		title: "Render Props Pattern",
		duration: "15:20",
		type: "video",
		description:
			"Explore the render props pattern, an alternative to HOCs that provides more flexibility. Learn when to use render props vs other patterns.",
		learningPoints: [
			"What are render props",
			"Implementing the render props pattern",
			"Comparing with HOCs",
			"Real-world use cases",
		],
	},
	{
		id: 4,
		title: "Compound Components",
		duration: "22:10",
		type: "video",
		description:
			"Master the compound components pattern used by popular libraries like Radix UI and Reach UI. Build flexible, declarative component APIs.",
		learningPoints: [
			"Understanding compound components",
			"Using React.Children and cloneElement",
			"Context-based compound components",
			"Building a flexible dropdown component",
		],
	},
	{
		id: 5,
		title: "Practice: Building a Dropdown",
		duration: "30:00",
		type: "exercise",
		description:
			"Put your knowledge into practice by building a fully-featured dropdown component using the patterns learned so far.",
		learningPoints: [
			"Applying compound components pattern",
			"Handling keyboard navigation",
			"Managing focus and accessibility",
			"Testing your component",
		],
	},
	{
		id: 6,
		title: "Context API Deep Dive",
		duration: "20:15",
		type: "video",
		description:
			"Explore the Context API in depth and learn how to use it effectively for state management in React applications. Understand when to use Context, how to optimize performance, and common patterns.",
		learningPoints: [
			"Understanding Context API fundamentals",
			"Creating and consuming context",
			"Performance optimization techniques",
			"Best practices and common pitfalls",
		],
	},
	{
		id: 7,
		title: "Custom Hooks Patterns",
		duration: "25:30",
		type: "video",
		description:
			"Learn how to create powerful custom hooks that encapsulate complex logic. Explore patterns for building reusable, testable hooks.",
		learningPoints: [
			"Creating custom hooks from scratch",
			"Hook composition patterns",
			"Testing custom hooks",
			"Building a hooks library",
		],
	},
	{
		id: 8,
		title: "State Management Patterns",
		duration: "28:45",
		type: "video",
		description:
			"Compare different state management approaches and learn when to use each. From useState to useReducer to external libraries.",
		learningPoints: [
			"Local vs global state",
			"useReducer patterns",
			"State machines with XState",
			"Choosing the right approach",
		],
	},
];

export default function ContinueLearningPage({
	params,
}: {
	params: { courseId: string };
}) {
	const [completedLessons, setCompletedLessons] = useState<Set<number>>(
		new Set([1, 2, 3, 4, 5]),
	);
	const [currentLessonId, setCurrentLessonId] = useState(6);
	const [isCompleting, setIsCompleting] = useState(false);

	const course = {
		id: params.courseId,
		title: "Advanced React Patterns",
		instructor: "Sarah Johnson",
		totalLessons: initialLessons.length,
	};

	const currentLesson = useMemo(
		() =>
			initialLessons.find((l) => l.id === currentLessonId) || initialLessons[0],
		[currentLessonId],
	);

	const progress = useMemo(
		() => Math.round((completedLessons.size / initialLessons.length) * 100),
		[completedLessons],
	);

	const completedCount = completedLessons.size;

	const currentIndex = initialLessons.findIndex(
		(l) => l.id === currentLessonId,
	);
	const hasPrevious = currentIndex > 0;
	const hasNext = currentIndex < initialLessons.length - 1;

	const handleSelectLesson = (lessonId: number) => {
		setCurrentLessonId(lessonId);
	};

	const handlePreviousLesson = () => {
		const previousLessonId = initialLessons[currentIndex - 1]?.id;
		if (hasPrevious && previousLessonId) {
			setCurrentLessonId(previousLessonId);
		}
	};

	const handleNextLesson = () => {
		const nextLessonId = initialLessons[currentIndex + 1]?.id;
		if (hasNext && nextLessonId) {
			setCurrentLessonId(nextLessonId);
		}
	};

	const handleCompleteLesson = async () => {
		setIsCompleting(true);
		// Simulate API call
		await new Promise((resolve) => setTimeout(resolve, 500));

		setCompletedLessons((prev) => {
			const updated = new Set(prev);
			updated.add(currentLessonId);
			return updated;
		});

		setIsCompleting(false);

		const nextLessonId = initialLessons[currentIndex + 1]?.id;
		// Auto-advance to next lesson if available
		if (hasNext && nextLessonId) {
			setCurrentLessonId(nextLessonId);
		}
	};

	const handleMarkIncomplete = async () => {
		setIsCompleting(true);
		await new Promise((resolve) => setTimeout(resolve, 300));

		setCompletedLessons((prev) => {
			const updated = new Set(prev);
			updated.delete(currentLessonId);
			return updated;
		});

		setIsCompleting(false);
	};

	const isCurrentLessonCompleted = completedLessons.has(currentLessonId);

	return (
		<div className="space-y-6">
			{/* Course Header */}
			<div className="flex items-center justify-between">
				<div className="space-y-1">
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
				</div>
				<Badge variant="secondary">
					{completedCount}/{course.totalLessons} Lessons
				</Badge>
			</div>

			{/* Progress Bar */}
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

			{/* Main Content */}
			<div className="grid gap-6 lg:grid-cols-3">
				{/* Video Player & Content */}
				<div className="space-y-6 lg:col-span-2">
					{/* Video Player */}
					<Card className="overflow-hidden">
						<div className="aspect-video w-full bg-black">
							<div className="flex h-full items-center justify-center">
								<PlayCircle className="h-16 w-16 text-white/80" />
							</div>
						</div>
					</Card>

					{/* Lesson Content */}
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
											<CardTitle>{currentLesson?.title}</CardTitle>
											<CardDescription>
												Lesson {currentLesson?.id} of {course.totalLessons} •{" "}
												{currentLesson?.duration}
											</CardDescription>
										</div>
										{isCurrentLessonCompleted ? (
											<Button
												disabled={isCompleting}
												onClick={handleMarkIncomplete}
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
												onClick={handleCompleteLesson}
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
									<p className="text-muted-foreground text-sm leading-relaxed">
										{currentLesson?.description}
									</p>
									<Separator />
									<div className="space-y-2">
										<h4 className="font-semibold">What you&apos;ll learn:</h4>
										<ul className="space-y-1 text-muted-foreground text-sm">
											{currentLesson?.learningPoints.map((point) => (
												<li className="flex items-start gap-2" key={point}>
													<CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
													<span>{point}</span>
												</li>
											))}
										</ul>
									</div>
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
									<div className="flex items-center justify-between rounded-lg border p-3">
										<div className="flex items-center gap-3">
											<FileText className="h-5 w-5 text-muted-foreground" />
											<div>
												<p className="font-medium text-sm">Lesson Notes.pdf</p>
												<p className="text-muted-foreground text-xs">2.4 MB</p>
											</div>
										</div>
										<Button size="sm" variant="ghost">
											<Download className="h-4 w-4" />
										</Button>
									</div>
									<div className="flex items-center justify-between rounded-lg border p-3">
										<div className="flex items-center gap-3">
											<FileText className="h-5 w-5 text-muted-foreground" />
											<div>
												<p className="font-medium text-sm">Code Examples.zip</p>
												<p className="text-muted-foreground text-xs">1.8 MB</p>
											</div>
										</div>
										<Button size="sm" variant="ghost">
											<Download className="h-4 w-4" />
										</Button>
									</div>
									<div className="flex items-center justify-between rounded-lg border p-3">
										<div className="flex items-center gap-3">
											<BookOpen className="h-5 w-5 text-muted-foreground" />
											<div>
												<p className="font-medium text-sm">
													Additional Reading
												</p>
												<p className="text-muted-foreground text-xs">
													External link
												</p>
											</div>
										</div>
										<Button size="sm" variant="ghost">
											<ChevronRight className="h-4 w-4" />
										</Button>
									</div>
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

					{/* Navigation Buttons */}
					<div className="flex items-center justify-between">
						<Button
							disabled={!hasPrevious}
							onClick={handlePreviousLesson}
							variant="outline"
						>
							<ChevronLeft className="mr-2 h-4 w-4" />
							Previous Lesson
						</Button>
						<Button disabled={!hasNext} onClick={handleNextLesson}>
							Next Lesson
							<ChevronRight className="ml-2 h-4 w-4" />
						</Button>
					</div>
				</div>

				{/* Lesson List Sidebar */}
				<div className="lg:col-span-1">
					<Card>
						<CardHeader>
							<CardTitle>Course Content</CardTitle>
							<CardDescription>
								{completedCount} of {course.totalLessons} lessons completed
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2">
							{initialLessons.map((lesson) => {
								const isCompleted = completedLessons.has(lesson.id);
								const isCurrent = lesson.id === currentLessonId;

								return (
									<button
										type="button"
										className={`flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors ${
											isCurrent
												? "bg-primary/10 text-primary"
												: isCompleted
													? "hover:bg-muted"
													: "hover:bg-muted"
										}`}
										key={lesson.id}
										onClick={() => handleSelectLesson(lesson.id)}
									>
										{isCompleted ? (
											<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
										) : (
											<Circle
												className={`mt-0.5 h-5 w-5 shrink-0 ${
													isCurrent ? "text-primary" : "text-muted-foreground"
												}`}
											/>
										)}
										<div className="flex-1 space-y-1">
											<p
												className={`font-medium text-sm leading-tight ${
													isCurrent ? "text-primary" : ""
												}`}
											>
												{lesson.title}
											</p>
											<div className="flex items-center gap-2 text-muted-foreground text-xs">
												<span>
													{lesson.type === "video" ? "Video" : "Exercise"}
												</span>
												<span>•</span>
												<span>{lesson.duration}</span>
											</div>
										</div>
									</button>
								);
							})}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
