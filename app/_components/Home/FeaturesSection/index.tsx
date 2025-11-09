import { Award, BookOpen, Clock, Users } from "lucide-react";

const FeaturesSection = () => {
	const features = [
		{
			icon: BookOpen,
			title: "Expert-Led Courses",
			description:
				"Learn from industry professionals with years of real-world experience",
		},
		{
			icon: Users,
			title: "Community Support",
			description:
				"Join a vibrant community of learners and get help when you need it",
		},
		{
			icon: Award,
			title: "Certified Learning",
			description:
				"Earn recognized certificates upon course completion to boost your career",
		},
		{
			icon: Clock,
			title: "Learn at Your Pace",
			description:
				"Access courses anytime, anywhere with lifetime access to materials",
		},
	];

	return (
		<section className="px-4 py-24">
			<div className="container mx-auto max-w-7xl">
				<div className="mb-16 text-center">
					<h2 className="mb-4 font-bold text-4xl">Why Choose Our Platform</h2>
					<p className="mx-auto max-w-2xl text-lg text-muted-foreground">
						We provide everything you need to succeed in your learning journey
					</p>
				</div>

				<div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
					{features.map((feature) => (
						<div className="text-center" key={feature.title}>
							<div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
								<feature.icon className="h-8 w-8 text-primary" />
							</div>
							<h3 className="mb-2 font-semibold text-xl">{feature.title}</h3>
							<p className="text-muted-foreground">{feature.description}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
};

export default FeaturesSection;
