import { Clock, Filter, Search, Star, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import PageLayout from "@/app/_components/_shared/Layouts/PageLayout";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";

const courses = [
	{
		id: "1",
		title: "Complete Web Development Bootcamp",
		description: "Become a Full-Stack Web Developer with just ONE course",
		instructor: "Angela Yu",
		rating: 4.8,
		reviews: 8542,
		students: 12500,
		duration: "52 hours",
		price: 89.99,
		originalPrice: 199.99,
		level: "Beginner",
		category: "Development",
		thumbnail: "/web-development-coding-screen.png",
	},
	{
		id: "2",
		title: "Data Science & Machine Learning",
		description:
			"Master Python, NumPy, Pandas, Matplotlib, and Machine Learning",
		instructor: "Jose Portilla",
		rating: 4.7,
		reviews: 6234,
		students: 9800,
		duration: "45 hours",
		price: 79.99,
		originalPrice: 189.99,
		level: "Intermediate",
		category: "Data Science",
		thumbnail: "/data-science-python-analytics.jpg",
	},
	{
		id: "3",
		title: "UI/UX Design Masterclass",
		description: "Learn User Interface and User Experience Design from scratch",
		instructor: "Daniel Walter Scott",
		rating: 4.9,
		reviews: 4521,
		students: 7600,
		duration: "38 hours",
		price: 69.99,
		originalPrice: 179.99,
		level: "Beginner",
		category: "Design",
		thumbnail: "/ui-ux-design-interface-mockup.jpg",
	},
	{
		id: "4",
		title: "Advanced JavaScript Concepts",
		description:
			"Deep dive into JavaScript: closures, prototypes, async/await, and more",
		instructor: "Andrei Neagoie",
		rating: 4.8,
		reviews: 5432,
		students: 8900,
		duration: "28 hours",
		price: 74.99,
		originalPrice: 169.99,
		level: "Advanced",
		category: "Development",
		thumbnail: "/web-development-coding-screen.png",
	},
	{
		id: "5",
		title: "Digital Marketing Masterclass",
		description:
			"Complete digital marketing course covering SEO, social media, email marketing",
		instructor: "Phil Ebiner",
		rating: 4.6,
		reviews: 3821,
		students: 6500,
		duration: "42 hours",
		price: 64.99,
		originalPrice: 159.99,
		level: "Beginner",
		category: "Marketing",
		thumbnail: "/web-development-coding-screen.png",
	},
	{
		id: "6",
		title: "Mobile App Development with React Native",
		description: "Build iOS and Android apps with React Native and Expo",
		instructor: "Maximilian Schwarzmüller",
		rating: 4.7,
		reviews: 4123,
		students: 7200,
		duration: "35 hours",
		price: 84.99,
		originalPrice: 194.99,
		level: "Intermediate",
		category: "Development",
		thumbnail: "/web-development-coding-screen.png",
	},
];

const categories = [
	"All Courses",
	"Development",
	"Design",
	"Data Science",
	"Marketing",
	"Business",
];

const CoursesPage = () => {
	return (
		<PageLayout>
			{/* Hero Section */}
			<section className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-background">
				<div className="container mx-auto px-4 py-16">
					<div className="mx-auto max-w-3xl space-y-6 text-center">
						<h1 className="text-balance font-bold text-4xl tracking-tight md:text-5xl">
							Explore Our Course Catalog
						</h1>
						<p className="text-balance text-muted-foreground text-xl">
							Choose from over 200,000 online video courses with new additions
							published every month
						</p>

						{/* Search Bar */}
						<div className="mx-auto flex max-w-2xl gap-2">
							<div className="relative flex-1">
								<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input className="pl-10" placeholder="Search for courses..." />
							</div>
							<Button size="lg">Search</Button>
						</div>
					</div>
				</div>
			</section>

			{/* Filters */}
			<section className="border-b bg-muted/30">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center gap-4 overflow-x-auto">
						<Button className="gap-2" size="sm" variant="ghost">
							<Filter className="h-4 w-4" />
							Filters
						</Button>
						{categories.map((category) => (
							<Button
								className="whitespace-nowrap"
								key={category}
								size="sm"
								variant={category === "All Courses" ? "default" : "outline"}
							>
								{category}
							</Button>
						))}
					</div>
				</div>
			</section>

			{/* Courses Grid */}
			<section className="py-12">
				<div className="container mx-auto px-4">
					<div className="mb-6 flex items-center justify-between">
						<h2 className="font-bold text-2xl">All Courses</h2>
						<p className="text-muted-foreground text-sm">
							{courses.length} courses
						</p>
					</div>

					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
						{courses.map((course) => (
							<Link href={`/courses/${course.id}`} key={course.id}>
								<Card className="h-full cursor-pointer transition-shadow hover:shadow-lg">
									<div className="relative aspect-video w-full overflow-hidden rounded-t-lg">
										<Image
											alt={course.title}
											className="h-full w-full object-cover transition-transform hover:scale-105"
											fill
											src={course.thumbnail || "/placeholder.svg"}
										/>
									</div>
									<CardHeader>
										<div className="mb-2 flex items-center justify-between">
											<Badge variant="secondary">{course.category}</Badge>
											<Badge variant="outline">{course.level}</Badge>
										</div>
										<CardTitle className="line-clamp-2">
											{course.title}
										</CardTitle>
										<CardDescription className="line-clamp-2">
											{course.description}
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-3">
										<p className="text-muted-foreground text-sm">
											By {course.instructor}
										</p>
										<div className="flex items-center gap-4 text-sm">
											<div className="flex items-center gap-1">
												<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
												<span className="font-semibold">{course.rating}</span>
												<span className="text-muted-foreground">
													({course.reviews})
												</span>
											</div>
											<div className="flex items-center gap-1 text-muted-foreground">
												<Users className="h-4 w-4" />
												<span>{course.students.toLocaleString()}</span>
											</div>
										</div>
										<div className="flex items-center gap-1 text-muted-foreground text-sm">
											<Clock className="h-4 w-4" />
											<span>{course.duration}</span>
										</div>
									</CardContent>
									<CardFooter className="flex items-center justify-between">
										<div className="flex items-baseline gap-2">
											<span className="font-bold text-2xl">
												${course.price}
											</span>
											<span className="text-muted-foreground text-sm line-through">
												${course.originalPrice}
											</span>
										</div>
									</CardFooter>
								</Card>
							</Link>
						))}
					</div>
				</div>
			</section>
		</PageLayout>
	);
};

export default CoursesPage;
