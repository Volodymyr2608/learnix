import { Check, Zap } from "lucide-react";
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

const plans = [
	{
		name: "Free",
		price: 0,
		description: "Perfect for getting started",
		features: [
			"Access to 50+ free courses",
			"Basic course materials",
			"Community forum access",
			"Mobile app access",
			"Course completion certificates",
		],
		cta: "Get Started",
		popular: false,
	},
	{
		name: "Pro",
		price: 29,
		description: "Best for serious learners",
		features: [
			"Access to 5,000+ premium courses",
			"All course materials & resources",
			"Priority support",
			"Offline course downloads",
			"Advanced analytics & progress tracking",
			"1-on-1 mentorship sessions (2/month)",
			"Career guidance & job placement",
			"Exclusive webinars & workshops",
		],
		cta: "Start Free Trial",
		popular: true,
	},
	{
		name: "Enterprise",
		price: 99,
		description: "For teams and organizations",
		features: [
			"Everything in Pro",
			"Unlimited team members",
			"Custom learning paths",
			"Advanced team analytics",
			"Dedicated account manager",
			"Custom integrations & API access",
			"White-label options",
			"Priority 24/7 support",
		],
		cta: "Contact Sales",
		popular: false,
	},
];

const faqs = [
	{
		question: "Can I switch plans anytime?",
		answer:
			"Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.",
	},
	{
		question: "Is there a free trial?",
		answer:
			"Yes! We offer a 14-day free trial for the Pro plan. No credit card required.",
	},
	{
		question: "What payment methods do you accept?",
		answer:
			"We accept all major credit cards, PayPal, and bank transfers for Enterprise plans.",
	},
	{
		question: "Can I get a refund?",
		answer:
			"Yes, we offer a 30-day money-back guarantee. If you're not satisfied, contact us for a full refund.",
	},
];

export default function PricingPage() {
	return (
		<PageLayout>
			{/* Hero Section */}
			<section className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-background">
				<div className="container mx-auto px-4 py-16">
					<div className="mx-auto max-w-3xl space-y-6 text-center">
						<Badge className="mb-4">Pricing Plans</Badge>
						<h1 className="text-balance font-bold text-4xl tracking-tight md:text-5xl">
							Choose the Perfect Plan for Your Learning Journey
						</h1>
						<p className="text-balance text-muted-foreground text-xl">
							Start learning today with our flexible pricing options. Cancel
							anytime.
						</p>
					</div>
				</div>
			</section>

			{/* Pricing Cards */}
			<section className="py-16">
				<div className="container mx-auto px-4">
					<div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
						{plans.map((plan) => (
							<Card
								className={`relative ${plan.popular ? "scale-105 border-primary shadow-lg" : ""}`}
								key={plan.name}
							>
								{plan.popular && (
									<div className="absolute -top-4 left-1/2 -translate-x-1/2">
										<Badge className="gap-1">
											<Zap className="h-3 w-3" />
											Most Popular
										</Badge>
									</div>
								)}
								<CardHeader>
									<CardTitle className="text-2xl">{plan.name}</CardTitle>
									<CardDescription>{plan.description}</CardDescription>
									<div className="mt-4">
										<span className="font-bold text-4xl">${plan.price}</span>
										<span className="text-muted-foreground">/month</span>
									</div>
								</CardHeader>
								<CardContent>
									<ul className="space-y-3">
										{plan.features.map((feature) => (
											<li className="flex gap-2" key={feature}>
												<Check className="h-5 w-5 shrink-0 text-primary" />
												<span className="text-sm">{feature}</span>
											</li>
										))}
									</ul>
								</CardContent>
								<CardFooter>
									<Button
										asChild
										className="w-full"
										size="lg"
										variant={plan.popular ? "default" : "outline"}
									>
										<Link
											href={
												plan.name === "Enterprise" ? "/contact" : "/sign-up"
											}
										>
											{plan.cta}
										</Link>
									</Button>
								</CardFooter>
							</Card>
						))}
					</div>
				</div>
			</section>

			{/* Comparison Table */}
			<section className="bg-muted/30 py-16">
				<div className="container mx-auto px-4">
					<div className="mx-auto mb-12 max-w-4xl text-center">
						<h2 className="mb-4 font-bold text-3xl">Compare Plans</h2>
						<p className="text-muted-foreground">
							Find the perfect plan that fits your learning needs
						</p>
					</div>

					<div className="mx-auto max-w-4xl overflow-hidden rounded-lg border bg-background">
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead className="bg-muted/50">
									<tr>
										<th className="p-4 text-left font-semibold">Features</th>
										<th className="p-4 text-center font-semibold">Free</th>
										<th className="p-4 text-center font-semibold">Pro</th>
										<th className="p-4 text-center font-semibold">
											Enterprise
										</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									<tr>
										<td className="p-4">Course Access</td>
										<td className="p-4 text-center">50+</td>
										<td className="p-4 text-center">5,000+</td>
										<td className="p-4 text-center">Unlimited</td>
									</tr>
									<tr>
										<td className="p-4">Certificates</td>
										<td className="p-4 text-center">
											<Check className="mx-auto h-5 w-5 text-primary" />
										</td>
										<td className="p-4 text-center">
											<Check className="mx-auto h-5 w-5 text-primary" />
										</td>
										<td className="p-4 text-center">
											<Check className="mx-auto h-5 w-5 text-primary" />
										</td>
									</tr>
									<tr>
										<td className="p-4">Offline Downloads</td>
										<td className="p-4 text-center text-muted-foreground">-</td>
										<td className="p-4 text-center">
											<Check className="mx-auto h-5 w-5 text-primary" />
										</td>
										<td className="p-4 text-center">
											<Check className="mx-auto h-5 w-5 text-primary" />
										</td>
									</tr>
									<tr>
										<td className="p-4">Mentorship Sessions</td>
										<td className="p-4 text-center text-muted-foreground">-</td>
										<td className="p-4 text-center">2/month</td>
										<td className="p-4 text-center">Unlimited</td>
									</tr>
									<tr>
										<td className="p-4">Team Management</td>
										<td className="p-4 text-center text-muted-foreground">-</td>
										<td className="p-4 text-center text-muted-foreground">-</td>
										<td className="p-4 text-center">
											<Check className="mx-auto h-5 w-5 text-primary" />
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</section>

			{/* FAQ Section */}
			<section className="py-16">
				<div className="container mx-auto px-4">
					<div className="mx-auto max-w-3xl">
						<div className="mb-12 text-center">
							<h2 className="mb-4 font-bold text-3xl">
								Frequently Asked Questions
							</h2>
							<p className="text-muted-foreground">
								Everything you need to know about our pricing
							</p>
						</div>

						<div className="space-y-6">
							{faqs.map((faq) => (
								<Card key={faq.question}>
									<CardHeader>
										<CardTitle className="text-lg">{faq.question}</CardTitle>
									</CardHeader>
									<CardContent>
										<p className="text-muted-foreground">{faq.answer}</p>
									</CardContent>
								</Card>
							))}
						</div>
					</div>
				</div>
			</section>

			{/* CTA Section */}
			<section className="border-t bg-gradient-to-br from-primary/10 via-primary/5 to-background">
				<div className="container mx-auto px-4 py-16">
					<div className="mx-auto max-w-3xl space-y-6 text-center">
						<h2 className="font-bold text-3xl">Ready to Start Learning?</h2>
						<p className="text-lg text-muted-foreground">
							Join thousands of students already learning on our platform
						</p>
						<div className="flex justify-center gap-4">
							<Button asChild size="lg">
								<Link href="/sign-up">Start Free Trial</Link>
							</Button>
							<Button asChild size="lg" variant="outline">
								<Link href="/courses">Browse Courses</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>
		</PageLayout>
	);
}
