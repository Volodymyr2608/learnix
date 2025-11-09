import { BookOpen, Clock, Users } from "lucide-react";
import Image from "next/image";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@/app/_components/_shared/ui/card";

const courses = [
	{
		id: 1,
		title: "Web Development Fundamentals",
		description:
			"Master HTML, CSS, and JavaScript to build modern websites from scratch.",
		image: "/web-development-coding-screen.png",
		instructor: "Sarah Johnson",
		students: 12500,
		duration: "8 weeks",
		level: "Beginner",
	},
	{
		id: 2,
		title: "Data Science with Python",
		description:
			"Learn data analysis, visualization, and machine learning with Python.",
		image: "/data-science-python-analytics.jpg",
		instructor: "Michael Chen",
		students: 9800,
		duration: "10 weeks",
		level: "Intermediate",
	},
	{
		id: 3,
		title: "UI/UX Design Masterclass",
		description:
			"Create beautiful, user-centered designs with industry-standard tools.",
		image: "/ui-ux-design-interface-mockup.jpg",
		instructor: "Emma Williams",
		students: 8200,
		duration: "6 weeks",
		level: "Beginner",
	},
];

const FeaturedCourses = () => {
	return (
		<section className="bg-muted/30 py-16 md:py-24">
			<div className="container mx-auto px-4">
				<div className="mb-12 text-center">
					<h2 className="mb-4 text-balance font-bold text-3xl md:text-4xl">
						Featured Courses
					</h2>
					<p className="mx-auto max-w-2xl text-pretty text-lg text-muted-foreground">
						Explore our most popular courses designed by industry experts to
						help you achieve your learning goals.
					</p>
				</div>

				<div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{courses.map((course) => (
						<Card
							className="flex flex-col overflow-hidden transition-shadow hover:shadow-lg"
							key={course.id}
						>
							<div className="aspect-video overflow-hidden">
								<Image
									alt={course.title}
									className="h-full w-full object-cover"
									src={course.image || "/placeholder.svg"}
								/>
							</div>
							<CardHeader>
								<div className="mb-2 flex items-center gap-2 text-muted-foreground text-sm">
									<span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary text-xs">
										{course.level}
									</span>
								</div>
								<h3 className="text-balance font-semibold text-xl">
									{course.title}
								</h3>
								<p className="text-pretty text-muted-foreground text-sm">
									{course.description}
								</p>
							</CardHeader>
							<CardContent className="flex-1">
								<div className="flex items-center gap-4 text-muted-foreground text-sm">
									<div className="flex items-center gap-1">
										<Users className="h-4 w-4" />
										<span>{course.students.toLocaleString()}</span>
									</div>
									<div className="flex items-center gap-1">
										<Clock className="h-4 w-4" />
										<span>{course.duration}</span>
									</div>
								</div>
							</CardContent>
							<CardFooter className="flex items-center justify-between border-t pt-4">
								<div className="flex items-center gap-2">
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
										<BookOpen className="h-4 w-4 text-primary" />
									</div>
									<span className="font-medium text-sm">
										{course.instructor}
									</span>
								</div>
								<Button size="sm">Enroll</Button>
							</CardFooter>
						</Card>
					))}
				</div>

				<div className="text-center">
					<Button size="lg" variant="outline">
						View All Courses
					</Button>
				</div>
			</div>
		</section>
	);
};

export default FeaturedCourses;
