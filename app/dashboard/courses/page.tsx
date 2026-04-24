import { BookOpen, Clock, PlayCircle } from "lucide-react";
import Image from "next/image";
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
import getStudentEnrolledCourses from "@/lib/requests/course/getStudentEnrolledCourses";

const MyCoursesPage = async () => {
	const courses = await getStudentEnrolledCourses();

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
						<div className="relative aspect-video w-full overflow-hidden bg-muted">
							<Image
								alt={course.title}
								className="h-full w-full object-cover"
								fill
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
};

export default MyCoursesPage;
