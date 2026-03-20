import { DollarSign, TrendingUp, Users } from "lucide-react";

const TeachHero = () => {
	return (
		<section className="bg-gradient-to-b from-primary/5 to-background py-20">
			<div className="container mx-auto max-w-7xl px-4">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="mb-6 font-bold text-4xl tracking-tight sm:text-5xl lg:text-6xl">
						Become an Instructor
					</h1>
					<p className="mb-8 text-lg text-muted-foreground leading-relaxed">
						Share your knowledge with millions of students worldwide. Create
						courses, build your brand, and earn money doing what you love.
					</p>
				</div>

				{/* Stats */}
				<div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
					<div className="flex flex-col items-center gap-2 rounded-lg bg-background p-6 text-center shadow-sm">
						<Users className="h-8 w-8 text-primary" />
						<div className="font-bold text-3xl">50K+</div>
						<div className="text-muted-foreground text-sm">Active Students</div>
					</div>
					<div className="flex flex-col items-center gap-2 rounded-lg bg-background p-6 text-center shadow-sm">
						<TrendingUp className="h-8 w-8 text-primary" />
						<div className="font-bold text-3xl">95%</div>
						<div className="text-muted-foreground text-sm">Success Rate</div>
					</div>
					<div className="flex flex-col items-center gap-2 rounded-lg bg-background p-6 text-center shadow-sm">
						<DollarSign className="h-8 w-8 text-primary" />
						<div className="font-bold text-3xl">$2M+</div>
						<div className="text-muted-foreground text-sm">
							Paid to Instructors
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};

export default TeachHero;
