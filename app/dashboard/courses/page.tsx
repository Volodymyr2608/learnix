"use client";

import { BarChart, Edit, Eye, Plus, Search, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";
import { DeleteCourseDialog } from "@/app/_components/Course/DeleteCourseDialog";
import DASHBOARD_URLS from "@/lib/constants/urls/dashboardUrls";

export default function InstructorCoursesPage() {
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [courseToDelete, setCourseToDelete] = useState<{
		id: number;
		title: string;
	} | null>(null);

	const courses = [
		{
			id: 1,
			title: "Complete Web Development Bootcamp",
			students: 456,
			status: "Published",
			revenue: "$4,560",
			rating: 4.9,
			lastUpdated: "2 days ago",
			thumbnail: "/web-development-concept.png",
		},
		{
			id: 2,
			title: "Advanced React Patterns",
			students: 342,
			status: "Published",
			revenue: "$3,420",
			rating: 4.8,
			lastUpdated: "1 week ago",
			thumbnail: "/react-patterns.png",
		},
		{
			id: 3,
			title: "Python for Data Science",
			students: 289,
			status: "Published",
			revenue: "$2,890",
			rating: 4.7,
			lastUpdated: "3 days ago",
			thumbnail: "/python-data-science.png",
		},
		{
			id: 4,
			title: "Machine Learning Fundamentals",
			students: 0,
			status: "Draft",
			revenue: "$0",
			rating: 0,
			lastUpdated: "Today",
			thumbnail: "/machine-learning-concept.png",
		},
	];

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl tracking-tight">My Courses</h1>
					<p className="text-muted-foreground">Manage and track your courses</p>
				</div>
				<Button asChild>
					<Link href="/instructor/courses/new">
						<Plus className="mr-2 h-4 w-4" />
						Create New Course
					</Link>
				</Button>
			</div>

			{/* Stats */}
			<div className="grid gap-4 md:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="font-medium text-sm">Total Courses</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">8</div>
						<p className="text-muted-foreground text-xs">+1 this month</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="font-medium text-sm">Published</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">6</div>
						<p className="text-muted-foreground text-xs">2 drafts</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="font-medium text-sm">
							Total Students
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">1,234</div>
						<p className="text-muted-foreground text-xs">+87 this month</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="font-medium text-sm">Total Revenue</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">$12,450</div>
						<p className="text-muted-foreground text-xs">+$1,230 this month</p>
					</CardContent>
				</Card>
			</div>

			{/* Search and Filters */}
			<div className="flex gap-4">
				<div className="relative flex-1">
					<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
					<Input className="pl-10" placeholder="Search your courses..." />
				</div>
				<Button variant="outline">All Status</Button>
				<Button variant="outline">Sort By</Button>
			</div>

			{/* Courses Grid */}
			<div className="grid gap-6 md:grid-cols-2">
				{courses.map((course) => (
					<Card className="overflow-hidden" key={course.id}>
						<div className="aspect-video w-full overflow-hidden bg-muted">
							<Image
								alt={course.title}
								className="h-full w-full object-cover"
								src={course.thumbnail || "/placeholder.svg"}
							/>
						</div>
						<CardHeader>
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<CardTitle className="line-clamp-1">{course.title}</CardTitle>
									<CardDescription className="mt-1">
										Updated {course.lastUpdated}
									</CardDescription>
								</div>
								<Badge
									variant={
										course.status === "Published" ? "default" : "secondary"
									}
								>
									{course.status}
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-3 gap-4 text-center">
								<div>
									<p className="font-bold text-2xl">{course.students}</p>
									<p className="text-muted-foreground text-xs">Students</p>
								</div>
								<div>
									<p className="font-bold text-2xl">
										{course.rating > 0 ? course.rating : "-"}
									</p>
									<p className="text-muted-foreground text-xs">Rating</p>
								</div>
								<div>
									<p className="font-bold text-2xl">{course.revenue}</p>
									<p className="text-muted-foreground text-xs">Revenue</p>
								</div>
							</div>
							<div className="flex gap-2">
								<Button
									asChild
									className="flex-1 bg-transparent"
									variant="outline"
								>
									<Link href={DASHBOARD_URLS.editCourse(course.id.toString())}>
										<Edit className="mr-2 h-4 w-4" />
										Edit
									</Link>
								</Button>
								<Button
									asChild
									className="flex-1 bg-transparent"
									variant="outline"
								>
									<Link
										href={DASHBOARD_URLS.previewCourse(course.id.toString())}
									>
										<Eye className="mr-2 h-4 w-4" />
										Preview
									</Link>
								</Button>
								<Button asChild size="icon" variant="outline">
									<Link href={`/instructor/courses/${course.id}/analytics`}>
										<BarChart className="h-4 w-4" />
									</Link>
								</Button>
								<Button
									onClick={() => {
										setCourseToDelete({ id: course.id, title: course.title });
										setDeleteDialogOpen(true);
									}}
									size="icon"
									variant="outline"
								>
									<Trash2 className="h-4 w-4 text-red-600" />
								</Button>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{/* Delete Confirmation Dialog */}
			{courseToDelete && (
				<DeleteCourseDialog
					courseId={courseToDelete.id}
					courseTitle={courseToDelete.title}
					onOpenChange={setDeleteDialogOpen}
					open={deleteDialogOpen}
				/>
			)}
		</div>
	);
}
