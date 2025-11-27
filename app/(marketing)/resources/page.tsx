import { BookOpen, Download, FileText, Search, Video } from "lucide-react";
import PageLayout from "@/app/_components/_shared/Layouts/PageLayout";
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

const resources = [
	{
		id: "1",
		title: "Complete Web Development Roadmap 2025",
		description:
			"A comprehensive guide to becoming a full-stack web developer in 2025",
		type: "Guide",
		category: "Development",
		downloads: 12500,
		icon: FileText,
	},
	{
		id: "2",
		title: "UI/UX Design Principles Cheat Sheet",
		description: "Essential design principles every designer should know",
		type: "PDF",
		category: "Design",
		downloads: 8900,
		icon: FileText,
	},
	{
		id: "3",
		title: "JavaScript ES6+ Features Tutorial",
		description: "Learn modern JavaScript features with practical examples",
		type: "Video",
		category: "Development",
		downloads: 15200,
		icon: Video,
	},
	{
		id: "4",
		title: "Data Science Python Libraries Guide",
		description: "Master NumPy, Pandas, Matplotlib, and Scikit-learn",
		type: "eBook",
		category: "Data Science",
		downloads: 6700,
		icon: BookOpen,
	},
	{
		id: "5",
		title: "React Hooks Complete Reference",
		description: "Everything you need to know about React Hooks",
		type: "Guide",
		category: "Development",
		downloads: 11300,
		icon: FileText,
	},
	{
		id: "6",
		title: "SEO Optimization Checklist",
		description: "Step-by-step checklist to improve your website's SEO",
		type: "PDF",
		category: "Marketing",
		downloads: 9400,
		icon: FileText,
	},
];

const categories = [
	"All Resources",
	"Development",
	"Design",
	"Data Science",
	"Marketing",
	"Business",
];

const ResourcesPage = () => {
	return (
		<PageLayout>
			{/* Hero Section */}
			<section className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-background">
				<div className="container mx-auto px-4 py-16">
					<div className="mx-auto max-w-3xl space-y-6 text-center">
						<h1 className="text-balance font-bold text-4xl tracking-tight md:text-5xl">
							Free Learning Resources
						</h1>
						<p className="text-balance text-muted-foreground text-xl">
							Access our collection of free guides, eBooks, cheat sheets, and
							tutorials to accelerate your learning
						</p>

						{/* Search Bar */}
						<div className="mx-auto flex max-w-2xl gap-2">
							<div className="relative flex-1">
								<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
								<Input className="pl-10" placeholder="Search resources..." />
							</div>
							<Button size="lg">Search</Button>
						</div>
					</div>
				</div>
			</section>

			{/* Categories */}
			<section className="border-b bg-muted/30">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center gap-4 overflow-x-auto">
						{categories.map((category) => (
							<Button
								className="whitespace-nowrap"
								key={category}
								size="sm"
								variant={category === "All Resources" ? "default" : "outline"}
							>
								{category}
							</Button>
						))}
					</div>
				</div>
			</section>

			{/* Resources Grid */}
			<section className="py-12">
				<div className="container mx-auto px-4">
					<div className="mb-6 flex items-center justify-between">
						<h2 className="font-bold text-2xl">All Resources</h2>
						<p className="text-muted-foreground text-sm">
							{resources.length} resources available
						</p>
					</div>

					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
						{resources.map((resource) => {
							const Icon = resource.icon;
							return (
								<Card
									className="transition-shadow hover:shadow-lg"
									key={resource.id}
								>
									<CardHeader>
										<div className="mb-2 flex items-start justify-between">
											<div className="rounded-lg bg-primary/10 p-2">
												<Icon className="h-6 w-6 text-primary" />
											</div>
											<Badge variant="secondary">{resource.type}</Badge>
										</div>
										<CardTitle className="line-clamp-2">
											{resource.title}
										</CardTitle>
										<CardDescription className="line-clamp-2">
											{resource.description}
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-4">
										<div className="flex items-center justify-between text-sm">
											<Badge variant="outline">{resource.category}</Badge>
											<span className="flex items-center gap-1 text-muted-foreground">
												<Download className="h-3 w-3" />
												{resource.downloads.toLocaleString()} downloads
											</span>
										</div>
										<Button className="w-full gap-2">
											<Download className="h-4 w-4" />
											Download Free
										</Button>
									</CardContent>
								</Card>
							);
						})}
					</div>
				</div>
			</section>

			{/* CTA Section */}
			<section className="border-t bg-muted/30">
				<div className="container mx-auto px-4 py-16">
					<div className="mx-auto max-w-3xl space-y-6 text-center">
						<h2 className="font-bold text-3xl">Want More Resources?</h2>
						<p className="text-lg text-muted-foreground">
							Subscribe to our newsletter and get exclusive learning materials
							delivered to your inbox every week
						</p>
						<div className="mx-auto flex max-w-md gap-2">
							<Input placeholder="Enter your email" type="email" />
							<Button size="lg">Subscribe</Button>
						</div>
					</div>
				</div>
			</section>
		</PageLayout>
	);
};

export default ResourcesPage;
