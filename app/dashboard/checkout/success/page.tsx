import { CheckCircle2, Clock, XCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { api } from "@/trpc/server";

export default async function CheckoutSuccessPage({
	searchParams,
}: {
	searchParams: Promise<{ session_id?: string }>;
}) {
	const { session_id } = await searchParams;

	if (!session_id) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<Card className="w-full max-w-md text-center">
					<CardHeader className="pb-4">
						<div className="flex justify-center pb-2">
							<XCircle className="h-12 w-12 text-destructive" />
						</div>
						<CardTitle className="text-2xl">Invalid session</CardTitle>
						<CardDescription>
							No checkout session was found. If you completed a purchase, check
							your enrolled courses.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild className="w-full">
							<Link href="/dashboard/courses">View my courses</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	const result = await api.payment.getSessionStatus({ sessionId: session_id });

	if (result.status !== "succeeded") {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<Card className="w-full max-w-md text-center">
					<CardHeader className="pb-4">
						<div className="flex justify-center pb-2">
							<Clock className="h-12 w-12 text-muted-foreground" />
						</div>
						<CardTitle className="text-2xl">Payment processing</CardTitle>
						<CardDescription>
							Your payment is being processed. Your course will appear in your
							enrolled courses once it's confirmed — usually within a few
							seconds.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<Button asChild className="w-full">
							<Link href="/dashboard/courses">Check my courses</Link>
						</Button>
						<Button asChild className="w-full" variant="outline">
							<Link href="/dashboard">Return to dashboard</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<Card className="w-full max-w-md text-center">
				<CardHeader className="pb-4">
					<div className="flex justify-center pb-2">
						<CheckCircle2 className="h-12 w-12 text-green-500" />
					</div>
					<CardTitle className="text-2xl">Payment successful!</CardTitle>
					<CardDescription>
						You now have full access to your new course. Start learning whenever
						you're ready.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Button asChild className="w-full">
						<Link href="/dashboard/courses">Start learning</Link>
					</Button>
					<Button asChild className="w-full" variant="outline">
						<Link href="/dashboard/browse">Browse more courses</Link>
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
