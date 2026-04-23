import { BookOpen, Clock, PlayCircle } from "lucide-react";
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

export default function MyCoursesPage() {
	const courses = [
		{
			id: 1,
			title: "Advanced React Patterns",
			instructor: "Sarah Johnson",
			progress: 65,
			totalLessons: 24,
			completedLessons: 16,
			duration: "8 hours",
			thumbnail: "/web-development-coding-screen.png",
			status: "In Progress",
		},
		{
			id: 2,
			title: "TypeScript Fundamentals",
			instructor: "Michael Chen",
			progress: 42,
			totalLessons: 18,
			completedLessons: 8,
			duration: "6 hours",
			thumbnail: "/data-science-python-analytics.jpg",
			status: "In Progress",
		},
		{
			id: 3,
			title: "UI/UX Design Principles",
			instructor: "Emily Rodriguez",
			progress: 88,
			totalLessons: 20,
			completedLessons: 18,
			duration: "10 hours",
			thumbnail: "/ui-ux-design-interface-mockup.jpg",
			status: "In Progress",
		},
		{
			id: 4,
			title: "Python for Data Science",
			instructor: "David Kim",
			progress: 100,
			totalLessons: 30,
			completedLessons: 30,
			duration: "15 hours",
			thumbnail: "/data-science-python-analytics.jpg",
			status: "Completed",
		},
	];

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl tracking-tight">My Courses</h1>
					<p className="text-muted-foreground">
						Manage and continue your learning journey
					</p>
				</div>
				<Button>Browse More Courses</Button>
			</div>

			{/* Filters */}
			<div className="flex gap-2">
				<Button size="sm" variant="outline">
					All Courses
				</Button>
				<Button size="sm" variant="ghost">
					In Progress
				</Button>
				<Button size="sm" variant="ghost">
					Completed
				</Button>
			</div>

			{/* Courses Grid */}
			<div className="grid gap-6 md:grid-cols-2">
				{courses.map((course) => (
					<Card className="overflow-hidden" key={course.id}>
						<div className="aspect-video w-full overflow-hidden bg-muted">
							<img
								alt={course.title}
								className="h-full w-full object-cover"
								src={course.thumbnail || "/placeholder.svg"}
							/>
						</div>
						<CardHeader>
							<div className="flex items-start justify-between">
								<div className="space-y-1">
									<CardTitle className="text-xl">{course.title}</CardTitle>
									<CardDescription>by {course.instructor}</CardDescription>
								</div>
								<Badge
									variant={
										course.status === "Completed" ? "default" : "secondary"
									}
								>
									{course.status}
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<div className="flex items-center justify-between text-sm">
									<span className="text-muted-foreground">Progress</span>
									<span className="font-medium">{course.progress}%</span>
								</div>
								<Progress value={course.progress} />
							</div>

							<div className="flex items-center justify-between text-muted-foreground text-sm">
								<div className="flex items-center gap-1">
									<BookOpen className="h-4 w-4" />
									<span>
										{course.completedLessons}/{course.totalLessons} lessons
									</span>
								</div>
								<div className="flex items-center gap-1">
									<Clock className="h-4 w-4" />
									<span>{course.duration}</span>
								</div>
							</div>

							<Button
								asChild
								className="w-full"
								variant={course.status === "Completed" ? "outline" : "default"}
							>
								<a
									href={
										course.status === "Completed"
											? `/dashboard/courses/${course.id}/review`
											: `/dashboard/courses/${course.id}/learn`
									}
								>
									<PlayCircle className="mr-2 h-4 w-4" />
									{course.status === "Completed"
										? "Review Course"
										: "Continue Learning"}
								</a>
							</Button>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
