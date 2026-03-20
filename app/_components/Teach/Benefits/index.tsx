import { CheckCircle } from "lucide-react";

const Benefits = () => {
	return (
		<section className="py-16">
			<div className="container mx-auto max-w-7xl px-4">
				<h2 className="mb-12 text-center font-bold text-3xl">
					Why Teach With Us?
				</h2>
				<div className="grid gap-8 md:grid-cols-3">
					<div className="flex flex-col gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
							<CheckCircle className="h-6 w-6 text-primary" />
						</div>
						<h3 className="font-semibold text-xl">Reach Global Audience</h3>
						<p className="text-muted-foreground leading-relaxed">
							Connect with students from around the world and make a real impact
							on their learning journey.
						</p>
					</div>
					<div className="flex flex-col gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
							<CheckCircle className="h-6 w-6 text-primary" />
						</div>
						<h3 className="font-semibold text-xl">Earn Money</h3>
						<p className="text-muted-foreground leading-relaxed">
							Get paid for your expertise. Set your own prices and earn revenue
							from course sales.
						</p>
					</div>
					<div className="flex flex-col gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
							<CheckCircle className="h-6 w-6 text-primary" />
						</div>
						<h3 className="font-semibold text-xl">Full Support</h3>
						<p className="text-muted-foreground leading-relaxed">
							Access our instructor resources, tools, and dedicated support team
							to help you succeed.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
};

export default Benefits;
