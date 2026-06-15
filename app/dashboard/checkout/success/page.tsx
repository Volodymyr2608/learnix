import { CheckCircle2, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { api } from "@/trpc/server";

type StatusCardProps = {
	icon: ReactNode;
	title: string;
	description: string;
	children: ReactNode;
};

function StatusCard({ icon, title, description, children }: StatusCardProps) {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<Card className="w-full max-w-md text-center">
				<CardHeader className="pb-4">
					<div className="flex justify-center pb-2">{icon}</div>
					<CardTitle className="text-2xl">{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">{children}</CardContent>
			</Card>
		</div>
	);
}

export default async function CheckoutSuccessPage({
	searchParams,
}: {
	searchParams: Promise<{ session_id?: string }>;
}) {
	const { session_id } = await searchParams;

	if (!session_id) {
		return (
			<StatusCard
				description="No checkout session was found. If you completed a purchase, check your enrolled courses."
				icon={<XCircle className="h-12 w-12 text-destructive" />}
				title="Invalid session"
			>
				<Button asChild className="w-full">
					<Link href="/dashboard/courses">View my courses</Link>
				</Button>
			</StatusCard>
		);
	}

	const result = await api.payment.getSessionStatus({ sessionId: session_id });

	if (result.status !== "succeeded") {
		return (
			<StatusCard
				description="Your payment is being processed. Your course will appear in your enrolled courses once it's confirmed — usually within a few seconds."
				icon={<Clock className="h-12 w-12 text-muted-foreground" />}
				title="Payment processing"
			>
				<Button asChild className="w-full">
					<Link href="/dashboard/courses">Check my courses</Link>
				</Button>
				<Button asChild className="w-full" variant="outline">
					<Link href="/dashboard">Return to dashboard</Link>
				</Button>
			</StatusCard>
		);
	}

	return (
		<StatusCard
			description="You now have full access to your new course. Start learning whenever you're ready."
			icon={<CheckCircle2 className="h-12 w-12 text-green-500" />}
			title="Payment successful!"
		>
			<Button asChild className="w-full">
				<Link href="/dashboard/courses">Start learning</Link>
			</Button>
			<Button asChild className="w-full" variant="outline">
				<Link href="/dashboard/browse">Browse more courses</Link>
			</Button>
		</StatusCard>
	);
}
