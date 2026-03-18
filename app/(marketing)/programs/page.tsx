import { ArrowRight, Award, BookOpen, Clock, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import PageLayout from "@/app/_components/_shared/components/Layouts/PageLayout";
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

const programs = [
	{
		id: "1",
		title: "Full-Stack Web Development",
		description: "Become a professional full-stack developer in 6 months",
		duration: "6 months",
		courses: 12,
		students: 8500,
		level: "Beginner to Advanced",
		skills: ["HTML/CSS", "JavaScript", "React", "Node.js", "MongoDB", "Git"],
		price: 499,
		thumbnail: "/web-development-coding-screen.png",
	},
	{
		id: "2",
		title: "Data Science & AI",
		description:
			"Master data science, machine learning, and artificial intelligence",
		duration: "8 months",
		courses: 15,
		students: 6200,
		level: "Intermediate to Advanced",
		skills: [
			"Python",
			"NumPy",
			"Pandas",
			"Machine Learning",
			"Deep Learning",
			"TensorFlow",
		],
		price: 599,
		thumbnail: "/data-science-python-analytics.jpg",
	},
	{
		id: "3",
		title: "UI/UX Design Professional",
		description: "Learn to design beautiful and functional user experiences",
		duration: "4 months",
		courses: 10,
		students: 5400,
		level: "Beginner to Intermediate",
		skills: [
			"Figma",
			"Adobe XD",
			"User Research",
			"Prototyping",
			"Design Systems",
			"Usability Testing",
		],
		price: 399,
		thumbnail: "/ui-ux-design-interface-mockup.jpg",
	},
	{
		id: "4",
		title: "Digital Marketing Mastery",
		description:
			"Complete digital marketing program from basics to advanced strategies",
		duration: "5 months",
		courses: 14,
		students: 7100,
		level: "Beginner to Advanced",
		skills: [
			"SEO",
			"Social Media",
			"Content Marketing",
			"Email Marketing",
			"Analytics",
			"PPC",
		],
		price: 449,
		thumbnail: "/web-development-coding-screen.png",
	},
];

const ProgramsPage = () => {
	return (
		<PageLayout>
			<section className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-background">
				<div className="container mx-auto px-4 py-16">
					<div className="mx-auto max-w-3xl space-y-6 text-center">
						<Badge className="mb-4">Career Programs</Badge>
						<h1 className="text-balance font-bold text-4xl tracking-tight md:text-5xl">
							Structured Learning Programs for Career Success
						</h1>
						<p className="text-balance text-muted-foreground text-xl">
							Follow our curated learning paths designed by industry experts to
							master in-demand skills and advance your career
						</p>
					</div>
				</div>
			</section>

			{/* Programs Grid */}
			<section className="py-16">
				<div className="container mx-auto px-4">
					<div className="mb-12 text-center">
						<h2 className="mb-4 font-bold text-3xl">Our Programs</h2>
						<p className="mx-auto max-w-2xl text-muted-foreground">
							Each program includes multiple courses, hands-on projects,
							mentorship, and a certificate of completion
						</p>
					</div>

					<div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
						{programs.map((program) => (
							<Card
								className="transition-shadow hover:shadow-lg"
								key={program.id}
							>
								<div className="relative aspect-video w-full overflow-hidden rounded-t-lg">
									<Image
										alt={program.title}
										className="h-full w-full object-cover"
										fill
										src={program.thumbnail || "/placeholder.svg"}
									/>
								</div>
								<CardHeader>
									<div className="mb-2 flex items-center justify-between">
										<Badge>{program.level}</Badge>
										<span className="font-bold text-2xl">${program.price}</span>
									</div>
									<CardTitle className="text-2xl">{program.title}</CardTitle>
									<CardDescription className="text-base">
										{program.description}
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="grid grid-cols-3 gap-4 text-sm">
										<div className="flex items-center gap-2">
											<Clock className="h-4 w-4 text-muted-foreground" />
											<span>{program.duration}</span>
										</div>
										<div className="flex items-center gap-2">
											<BookOpen className="h-4 w-4 text-muted-foreground" />
											<span>{program.courses} courses</span>
										</div>
										<div className="flex items-center gap-2">
											<Users className="h-4 w-4 text-muted-foreground" />
											<span>{program.students.toLocaleString()}</span>
										</div>
									</div>

									<div>
										<h4 className="mb-2 font-semibold text-sm">
											Skills you'll gain:
										</h4>
										<div className="flex flex-wrap gap-2">
											{program.skills.map((skill) => (
												<Badge key={skill} variant="secondary">
													{skill}
												</Badge>
											))}
										</div>
									</div>
								</CardContent>
								<CardFooter className="flex gap-2">
									<Button asChild className="flex-1 gap-2">
										<Link href={`/programs/${program.id}`}>
											View Program
											<ArrowRight className="h-4 w-4" />
										</Link>
									</Button>
									<Button className="flex-1 bg-transparent" variant="outline">
										Add to Cart
									</Button>
								</CardFooter>
							</Card>
						))}
					</div>
				</div>
			</section>

			{/* Benefits Section */}
			<section className="bg-muted/30 py-16">
				<div className="container mx-auto px-4">
					<div className="mx-auto max-w-4xl">
						<div className="mb-12 text-center">
							<h2 className="mb-4 font-bold text-3xl">
								Why Choose Our Programs?
							</h2>
							<p className="text-muted-foreground">
								Everything you need to succeed in your learning journey
							</p>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<Card>
								<CardHeader>
									<Award className="mb-2 h-10 w-10 text-primary" />
									<CardTitle>Industry-Recognized Certificates</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-muted-foreground">
										Earn certificates that are valued by employers and showcase
										your expertise
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<Users className="mb-2 h-10 w-10 text-primary" />
									<CardTitle>Expert Mentorship</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-muted-foreground">
										Get guidance from industry professionals with 1-on-1
										mentorship sessions
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<BookOpen className="mb-2 h-10 w-10 text-primary" />
									<CardTitle>Hands-On Projects</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-muted-foreground">
										Build real-world projects to add to your portfolio and
										demonstrate your skills
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<Clock className="mb-2 h-10 w-10 text-primary" />
									<CardTitle>Flexible Learning</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-muted-foreground">
										Learn at your own pace with lifetime access to all course
										materials
									</p>
								</CardContent>
							</Card>
						</div>
					</div>
				</div>
			</section>

			{/* CTA Section */}
			<section className="border-t bg-gradient-to-br from-primary/10 via-primary/5 to-background">
				<div className="container mx-auto px-4 py-16">
					<div className="mx-auto max-w-3xl space-y-6 text-center">
						<h2 className="font-bold text-3xl">
							Ready to Transform Your Career?
						</h2>
						<p className="text-lg text-muted-foreground">
							Join thousands of students who have successfully completed our
							programs and advanced their careers
						</p>
						<div className="flex justify-center gap-4">
							<Button asChild size="lg">
								<Link href="/sign-up">Get Started Today</Link>
							</Button>
							<Button asChild size="lg" variant="outline">
								<Link href="/contact">Talk to an Advisor</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>
		</PageLayout>
	);
};

export default ProgramsPage;
