import { ArrowRight } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";

const CTASection = () => {
	return (
		<section className="px-4 py-24">
			<div className="container mx-auto max-w-7xl">
				<div className="rounded-2xl bg-primary p-12 text-center text-primary-foreground md:p-16">
					<h2 className="mb-4 font-bold text-4xl md:text-5xl">
						Ready to Start Learning?
					</h2>
					<p className="mx-auto mb-8 max-w-2xl text-lg opacity-90 md:text-xl">
						Join over 50,000 students and start your journey to success today.
						Get access to all courses with a free trial.
					</p>
					<div className="flex flex-col justify-center gap-4 sm:flex-row">
						<Button className="text-lg" size="lg" variant="secondary">
							Start Free Trial
							<ArrowRight className="ml-2 h-5 w-5" />
						</Button>
						<Button
							className="border-primary-foreground bg-transparent text-lg text-primary-foreground hover:bg-primary-foreground hover:text-primary"
							size="lg"
							variant="outline"
						>
							View Pricing
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
};

export default CTASection;
