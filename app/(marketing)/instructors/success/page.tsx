import { BookOpen, CheckCircle2, Clock, Mail } from "lucide-react";
import Link from "next/link";
import PageLayout from "@/app/_components/_shared/components/Layouts/PageLayout";
import { Button } from "@/app/_components/_shared/ui/button";

export default function InstructorApplicationSuccessPage() {
	return (
		<PageLayout>
			<div className="container mx-auto max-w-3xl px-4 py-20">
				<div className="flex flex-col items-center gap-6 text-center">
					<div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10">
						<CheckCircle2 className="h-12 w-12 text-green-500" />
					</div>

					<div className="space-y-2">
						<h1 className="font-bold text-4xl">
							Application Submitted Successfully!
						</h1>
						<p className="text-lg text-muted-foreground">
							Thank you for your interest in becoming an instructor on our
							platform.
						</p>
					</div>

					<div className="w-full rounded-lg bg-muted/50 p-8">
						<h2 className="mb-6 font-semibold text-xl">What Happens Next?</h2>
						<div className="space-y-6">
							<div className="flex gap-4">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
									<Mail className="h-5 w-5 text-primary" />
								</div>
								<div className="text-left">
									<h3 className="font-semibold">Email Confirmation</h3>
									<p className="text-muted-foreground text-sm">
										You'll receive a confirmation email shortly with your
										application details.
									</p>
								</div>
							</div>

							<div className="flex gap-4">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
									<Clock className="h-5 w-5 text-primary" />
								</div>
								<div className="text-left">
									<h3 className="font-semibold">Review Process</h3>
									<p className="text-muted-foreground text-sm">
										Our team will review your application within 2-3 business
										days.
									</p>
								</div>
							</div>

							<div className="flex gap-4">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
									<BookOpen className="h-5 w-5 text-primary" />
								</div>
								<div className="text-left">
									<h3 className="font-semibold">Get Started</h3>
									<p className="text-muted-foreground text-sm">
										Once approved, you'll get access to your instructor
										dashboard and course creation tools.
									</p>
								</div>
							</div>
						</div>
					</div>

					<div className="flex flex-col gap-3 sm:flex-row">
						<Button asChild size="lg">
							<Link href="/dashboard">Go to Dashboard</Link>
						</Button>
						<Button asChild size="lg" variant="outline">
							<Link href="/courses">Browse Courses</Link>
						</Button>
					</div>
				</div>
			</div>
		</PageLayout>
	);
}
