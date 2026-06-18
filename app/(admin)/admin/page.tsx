import { DollarSign } from "lucide-react";
import { redirect } from "next/navigation";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { SweepButton } from "@/app/(admin)/admin/SweepButton";
import { Role } from "@/generated/prisma";
import { formatPrice } from "@/lib/formatPrice";
import { getSession } from "@/server/better-auth/server";
import { api } from "@/trpc/server";

export default async function AdminPage() {
	const session = await getSession();

	if (!session?.user) {
		redirect("/sign-in");
	}

	if (session.user.role !== Role.ADMIN) {
		redirect("/dashboard");
	}

	const { totalRevenueCents } = await api.payment.getPlatformRevenue();

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-3xl">Admin Dashboard</h1>
				<p className="text-muted-foreground">Platform overview and metrics.</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">
							Total Platform Revenue
						</CardTitle>
						<DollarSign className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">
							{formatPrice(totalRevenueCents)}
						</div>
						<p className="text-muted-foreground text-xs">
							Platform share after instructor payouts
						</p>
					</CardContent>
				</Card>
			</div>

			<div>
				<h2 className="mb-3 font-semibold text-lg">Operations</h2>
				<SweepButton />
			</div>
		</div>
	);
}
