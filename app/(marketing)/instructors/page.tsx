import { CheckCircle, DollarSign, TrendingUp, Users } from "lucide-react";
import PageLayout from "@/app/_components/_shared/Layouts/PageLayout";
import InstructorApplicationForm from "@/app/_components/Instructor/Forms/InstructorApplicationForm";

const BecomeInstructorPage = () => {
	return (
		<PageLayout>
			{/* Hero Section */}
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
							<div className="text-muted-foreground text-sm">
								Active Students
							</div>
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

			{/* Benefits Section */}
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
								Connect with students from around the world and make a real
								impact on their learning journey.
							</p>
						</div>
						<div className="flex flex-col gap-4">
							<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
								<CheckCircle className="h-6 w-6 text-primary" />
							</div>
							<h3 className="font-semibold text-xl">Earn Money</h3>
							<p className="text-muted-foreground leading-relaxed">
								Get paid for your expertise. Set your own prices and earn
								revenue from course sales.
							</p>
						</div>
						<div className="flex flex-col gap-4">
							<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
								<CheckCircle className="h-6 w-6 text-primary" />
							</div>
							<h3 className="font-semibold text-xl">Full Support</h3>
							<p className="text-muted-foreground leading-relaxed">
								Access our instructor resources, tools, and dedicated support
								team to help you succeed.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Application Form Section */}
			<section className="bg-muted/30 py-16">
				<div className="container mx-auto max-w-3xl px-4">
					<div className="mb-8 text-center">
						<h2 className="mb-4 font-bold text-3xl">
							Apply to Become an Instructor
						</h2>
						<p className="text-muted-foreground">
							Fill out the form below and we'll review your application within
							2-3 business days.
						</p>
					</div>
					<InstructorApplicationForm />
				</div>
			</section>
		</PageLayout>
	);
};

export default BecomeInstructorPage;
