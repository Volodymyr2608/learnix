import {
	Award,
	BookOpen,
	Clock,
	Globe,
	Linkedin,
	MapPin,
	Star,
	Twitter,
	Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import PageLayout from "@/app/_components/_shared/Layouts/PageLayout";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";

export default async function InstructorProfilePage({
	params,
}: {
	params: Promise<{ instructorId: string }>;
}) {
	const { instructorId } = await params;

	// Mock instructor data
	const instructor = {
		id: instructorId,
		name: "Sarah Johnson",
		title: "Senior Web Developer & Educator",
		avatar: "/placeholder.svg?height=200&width=200",
		bio: "I'm a passionate educator with over 10 years of experience in web development. I've worked with companies like Google and Microsoft, and now I dedicate my time to helping aspiring developers master modern web technologies. My teaching philosophy focuses on practical, hands-on learning that prepares students for real-world challenges.",
		location: "San Francisco, CA",
		totalStudents: 12450,
		totalCourses: 8,
		averageRating: 4.9,
		totalReviews: 2340,
		expertise: [
			"Web Development",
			"React",
			"Node.js",
			"JavaScript",
			"TypeScript",
		],
		socialLinks: {
			website: "https://sarahjohnson.dev",
			linkedin: "https://linkedin.com/in/sarahjohnson",
			twitter: "https://twitter.com/sarahjohnson",
		},
	};

	const courses = [
		{
			id: 1,
			title: "Complete Web Development Bootcamp",
			description:
				"Master HTML, CSS, JavaScript, React, and Node.js from scratch",
			thumbnail: "/web-development-coding.png",
			price: 89.99,
			originalPrice: 199.99,
			students: 4560,
			rating: 4.9,
			duration: "52 hours",
			level: "Beginner",
		},
		{
			id: 2,
			title: "Advanced React Patterns",
			description:
				"Learn advanced React patterns and best practices for scalable applications",
			thumbnail: "/react-patterns.png",
			price: 79.99,
			originalPrice: 149.99,
			students: 3420,
			rating: 4.8,
			duration: "38 hours",
			level: "Advanced",
		},
		{
			id: 3,
			title: "TypeScript Masterclass",
			description:
				"Deep dive into TypeScript for building type-safe applications",
			thumbnail: "/typescript-code.png",
			price: 69.99,
			students: 2890,
			rating: 4.9,
			duration: "28 hours",
			level: "Intermediate",
		},
	];

	const reviews = [
		{
			id: 1,
			student: "Michael Chen",
			avatar: "/placeholder.svg?height=50&width=50",
			rating: 5,
			date: "2 weeks ago",
			course: "Complete Web Development Bootcamp",
			comment:
				"Sarah is an amazing instructor! Her explanations are clear and the projects are practical. I landed my first developer job thanks to this course.",
		},
		{
			id: 2,
			student: "Emily Rodriguez",
			avatar: "/placeholder.svg?height=50&width=50",
			rating: 5,
			date: "1 month ago",
			course: "Advanced React Patterns",
			comment:
				"The best React course I've taken. Sarah's teaching style makes complex concepts easy to understand. Highly recommended!",
		},
		{
			id: 3,
			student: "David Kim",
			avatar: "/placeholder.svg?height=50&width=50",
			rating: 4,
			date: "1 month ago",
			course: "TypeScript Masterclass",
			comment:
				"Great course with lots of practical examples. Would love to see more advanced topics covered in future updates.",
		},
	];

	return (
		<PageLayout>
			{/* Hero Section */}
			<section className="border-b bg-muted/30 py-12">
				<div className="container mx-auto max-w-7xl px-4">
					<div className="flex flex-col gap-8 md:flex-row md:items-start">
						{/* Avatar */}
						<div className="relative shrink-0">
							<Image
								alt={instructor.name}
								className="h-40 w-40 rounded-full border-4 border-background object-cover shadow-lg"
								fill
								src={instructor.avatar || "/placeholder.svg"}
							/>
						</div>

						{/* Info */}
						<div className="flex-1 space-y-4">
							<div>
								<h1 className="font-bold text-4xl">{instructor.name}</h1>
								<p className="text-lg text-muted-foreground">
									{instructor.title}
								</p>
								<div className="mt-2 flex items-center gap-2 text-muted-foreground text-sm">
									<MapPin className="h-4 w-4" />
									<span>{instructor.location}</span>
								</div>
							</div>

							{/* Stats */}
							<div className="flex flex-wrap gap-6">
								<div className="flex items-center gap-2">
									<Users className="h-5 w-5 text-primary" />
									<div>
										<p className="font-bold text-2xl">
											{instructor.totalStudents.toLocaleString()}
										</p>
										<p className="text-muted-foreground text-xs">Students</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<BookOpen className="h-5 w-5 text-primary" />
									<div>
										<p className="font-bold text-2xl">
											{instructor.totalCourses}
										</p>
										<p className="text-muted-foreground text-xs">Courses</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />
									<div>
										<p className="font-bold text-2xl">
											{instructor.averageRating}
										</p>
										<p className="text-muted-foreground text-xs">
											{instructor.totalReviews.toLocaleString()} Reviews
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Award className="h-5 w-5 text-primary" />
									<div>
										<p className="font-bold text-2xl">Top</p>
										<p className="text-muted-foreground text-xs">Instructor</p>
									</div>
								</div>
							</div>

							{/* Expertise Tags */}
							<div className="flex flex-wrap gap-2">
								{instructor.expertise.map((skill) => (
									<Badge key={skill} variant="secondary">
										{skill}
									</Badge>
								))}
							</div>

							{/* Social Links */}
							<div className="flex gap-3">
								{instructor.socialLinks.website && (
									<Button asChild size="icon" variant="outline">
										<a
											href={instructor.socialLinks.website}
											rel="noopener noreferrer"
											target="_blank"
										>
											<Globe className="h-4 w-4" />
										</a>
									</Button>
								)}
								{instructor.socialLinks.linkedin && (
									<Button asChild size="icon" variant="outline">
										<a
											href={instructor.socialLinks.linkedin}
											rel="noopener noreferrer"
											target="_blank"
										>
											<Linkedin className="h-4 w-4" />
										</a>
									</Button>
								)}
								{instructor.socialLinks.twitter && (
									<Button asChild size="icon" variant="outline">
										<a
											href={instructor.socialLinks.twitter}
											rel="noopener noreferrer"
											target="_blank"
										>
											<Twitter className="h-4 w-4" />
										</a>
									</Button>
								)}
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* About Section */}
			<section className="py-12">
				<div className="container mx-auto max-w-7xl px-4">
					<h2 className="mb-6 font-bold text-3xl">About Me</h2>
					<div className="prose prose-lg max-w-none">
						<p className="text-muted-foreground leading-relaxed">
							{instructor.bio}
						</p>
					</div>
				</div>
			</section>

			{/* Courses Section */}
			<section className="bg-muted/30 py-12">
				<div className="container mx-auto max-w-7xl px-4">
					<div className="mb-8 flex items-center justify-between">
						<h2 className="font-bold text-3xl">
							Courses by {instructor.name.split(" ")[0]}
						</h2>
						<p className="text-muted-foreground">{courses.length} courses</p>
					</div>

					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
						{courses.map((course) => (
							<Card
								className="overflow-hidden transition-shadow hover:shadow-lg"
								key={course.id}
							>
								<Link href={`/courses/${course.id}`}>
									<div className="relative aspect-video w-full overflow-hidden bg-muted">
										<Image
											alt={course.title}
											className="h-full w-full object-cover"
											fill
											src={course.thumbnail || "/placeholder.svg"}
										/>
									</div>
									<div className="p-6">
										<div className="mb-2 flex items-center justify-between">
											<Badge variant="secondary">{course.level}</Badge>
											<div className="flex items-center gap-1 text-sm">
												<Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
												<span className="font-semibold">{course.rating}</span>
											</div>
										</div>
										<h3 className="mb-2 line-clamp-2 font-semibold text-lg">
											{course.title}
										</h3>
										<p className="mb-4 line-clamp-2 text-muted-foreground text-sm">
											{course.description}
										</p>
										<div className="mb-4 flex items-center gap-4 text-muted-foreground text-sm">
											<span className="flex items-center gap-1">
												<Users className="h-4 w-4" />
												{course.students.toLocaleString()}
											</span>
											<span className="flex items-center gap-1">
												<Clock className="h-4 w-4" />
												{course.duration}
											</span>
										</div>
										<div className="flex items-center gap-2">
											<span className="font-bold text-2xl">
												${course.price}
											</span>
											{course.originalPrice && (
												<span className="text-muted-foreground text-sm line-through">
													${course.originalPrice}
												</span>
											)}
										</div>
									</div>
								</Link>
							</Card>
						))}
					</div>
				</div>
			</section>

			{/* Reviews Section */}
			<section className="py-12">
				<div className="container mx-auto max-w-7xl px-4">
					<h2 className="mb-8 font-bold text-3xl">Student Reviews</h2>

					{/* Rating Summary */}
					<Card className="mb-8 p-6">
						<div className="flex flex-col gap-6 md:flex-row md:items-center">
							<div className="text-center">
								<div className="font-bold text-5xl">
									{instructor.averageRating}
								</div>
								<div className="mt-2 flex justify-center">
									{[1, 2, 3, 4, 5].map((star) => (
										<Star
											className="h-5 w-5 fill-yellow-500 text-yellow-500"
											key={star}
										/>
									))}
								</div>
								<p className="mt-2 text-muted-foreground text-sm">
									{instructor.totalReviews.toLocaleString()} reviews
								</p>
							</div>
							<div className="flex-1 space-y-2">
								{[5, 4, 3, 2, 1].map((rating) => (
									<div className="flex items-center gap-2" key={rating}>
										<span className="w-12 text-sm">{rating} star</span>
										<div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
											<div
												className="h-full bg-yellow-500"
												style={{
													width: `${rating === 5 ? 85 : rating === 4 ? 12 : 2}%`,
												}}
											/>
										</div>
										<span className="w-12 text-right text-muted-foreground text-sm">
											{rating === 5 ? "85%" : rating === 4 ? "12%" : "2%"}
										</span>
									</div>
								))}
							</div>
						</div>
					</Card>

					{/* Individual Reviews */}
					<div className="space-y-6">
						{reviews.map((review) => (
							<Card className="p-6" key={review.id}>
								<div className="relative flex gap-4">
									<Image
										alt={review.student}
										className="h-12 w-12 rounded-full object-cover"
										fill
										src={review.avatar || "/placeholder.svg"}
									/>
									<div className="flex-1">
										<div className="mb-2 flex items-start justify-between">
											<div>
												<h4 className="font-semibold">{review.student}</h4>
												<p className="text-muted-foreground text-sm">
													{review.date}
												</p>
											</div>
											<div className="flex">
												{[...Array(review.rating)]
													.map((_, index) => ({ id: index }))
													.map(({ id }) => (
														<Star
															className="h-4 w-4 fill-yellow-500 text-yellow-500"
															key={id}
														/>
													))}
											</div>
										</div>
										<p className="mb-2 font-medium text-muted-foreground text-sm">
											Course: {review.course}
										</p>
										<p className="text-sm leading-relaxed">{review.comment}</p>
									</div>
								</div>
							</Card>
						))}
					</div>

					<div className="mt-8 text-center">
						<Button variant="outline">Load More Reviews</Button>
					</div>
				</div>
			</section>
		</PageLayout>
	);
}
