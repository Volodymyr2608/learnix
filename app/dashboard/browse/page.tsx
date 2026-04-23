"use client";

import { Clock, Search, Star, Users } from "lucide-react";
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
import EnrollConfirmDialog from "@/app/_components/Course/components/EnrollConfirmDialog";

export default function BrowseCoursesPage() {
	const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
	const [selectedCourse, setSelectedCourse] = useState<{
		id: string;
		title: string;
		instructor: string;
		thumbnail: string;
		duration: string;
		level: string;
	} | null>(null);
	const isEnrolled = true;

	const handleEnrollClick = (course: typeof selectedCourse) => {
		setSelectedCourse(course);
		setEnrollDialogOpen(true);
	};
	const categories = [
		"All",
		"Development",
		"Design",
		"Business",
		"Marketing",
		"Data Science",
	];

	const courses = [
		{
			id: 1,
			title: "Complete Web Development Bootcamp",
			instructor: "Angela Yu",
			rating: 4.8,
			students: 12500,
			duration: "52 hours",
			price: "$89.99",
			level: "Beginner",
			thumbnail: "/web-development-coding-screen.png",
			category: "Development",
		},
		{
			id: 2,
			title: "Machine Learning A-Z",
			instructor: "John Doe",
			rating: 4.9,
			students: 8900,
			duration: "44 hours",
			price: "$94.99",
			level: "Intermediate",
			thumbnail: "/data-science-python-analytics.jpg",
			category: "Data Science",
		},
		{
			id: 3,
			title: "UI/UX Design Masterclass",
			instructor: "Daniel Walter Scott",
			rating: 4.7,
			students: 6700,
			duration: "28 hours",
			price: "$79.99",
			level: "All Levels",
			thumbnail: "/ui-ux-design-interface-mockup.jpg",
			category: "Design",
		},
		{
			id: 4,
			title: "Digital Marketing Strategy",
			instructor: "Rob Percival",
			rating: 4.6,
			students: 5400,
			duration: "18 hours",
			price: "$69.99",
			level: "Beginner",
			thumbnail: "/web-development-coding-screen.png",
			category: "Marketing",
		},
		{
			id: 5,
			title: "Python for Everybody",
			instructor: "Dr. Chuck",
			rating: 4.9,
			students: 15200,
			duration: "36 hours",
			price: "$84.99",
			level: "Beginner",
			thumbnail: "/data-science-python-analytics.jpg",
			category: "Development",
		},
		{
			id: 6,
			title: "Business Strategy Fundamentals",
			instructor: "Chris Haroun",
			rating: 4.5,
			students: 4200,
			duration: "22 hours",
			price: "$74.99",
			level: "Intermediate",
			thumbnail: "/ui-ux-design-interface-mockup.jpg",
			category: "Business",
		},
	];

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div>
				<h1 className="font-bold text-3xl tracking-tight">Browse Courses</h1>
				<p className="text-muted-foreground">
					Discover new skills and expand your knowledge
				</p>
			</div>

			{/* Search Bar */}
			<div className="relative">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input className="pl-10" placeholder="Search for courses..." />
			</div>

			{/* Category Filters */}
			<div className="flex gap-2 overflow-x-auto pb-2">
				{categories.map((category) => (
					<Button
						className="shrink-0"
						key={category}
						size="sm"
						variant={category === "All" ? "default" : "outline"}
					>
						{category}
					</Button>
				))}
			</div>

			{/* Courses Grid */}
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{courses.map((course) => (
					<Card
						className="overflow-hidden transition-shadow hover:shadow-lg"
						key={course.id}
					>
						<Link className="block" href={`/dashboard/browse/${course.id}`}>
							<div className="aspect-video w-full overflow-hidden bg-muted">
								<Image
									alt={course.title}
									className="h-full w-full object-cover"
									src={course.thumbnail || "/placeholder.svg"}
								/>
							</div>
						</Link>
						<CardHeader>
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<Badge variant="secondary">{course.category}</Badge>
									<Badge variant="outline">{course.level}</Badge>
								</div>
								<Link href={`/dashboard/browse/${course.id}`}>
									<CardTitle className="line-clamp-2 text-lg transition-colors hover:text-primary">
										{course.title}
									</CardTitle>
								</Link>
								<CardDescription>by {course.instructor}</CardDescription>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between text-sm">
								<div className="flex items-center gap-1">
									<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
									<span className="font-medium">{course.rating}</span>
								</div>
								<div className="flex items-center gap-1 text-muted-foreground">
									<Users className="h-4 w-4" />
									<span>{course.students.toLocaleString()}</span>
								</div>
								<div className="flex items-center gap-1 text-muted-foreground">
									<Clock className="h-4 w-4" />
									<span>{course.duration}</span>
								</div>
							</div>

							<div className="flex items-center justify-between">
								<span className="font-bold text-xl">{course.price}</span>
								{isEnrolled ? (
									<Button asChild size="sm" variant="outline">
										<Link href={`/dashboard/courses/${course.id}/learn`}>
											Continue
										</Link>
									</Button>
								) : (
									<Button
										onClick={() =>
											handleEnrollClick({
												id: String(course.id),
												title: course.title,
												instructor: course.instructor,
												thumbnail: course.thumbnail,
												duration: course.duration,
												level: course.level,
											})
										}
										size="sm"
									>
										Enroll Now
									</Button>
								)}
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{selectedCourse && (
				<EnrollConfirmDialog
					course={selectedCourse}
					onOpenChange={setEnrollDialogOpen}
					open={enrollDialogOpen}
				/>
			)}
		</div>
	);
}
