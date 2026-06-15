"use client";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { StatusBadgeProps } from "@/app/_components/Account/PayoutsSection/types";
import type { ConnectStatus } from "@/lib/connectStatus";
import { formatPrice } from "@/lib/formatPrice";
import { api } from "@/trpc/client";

const STATUS_CONFIG: Record<
	ConnectStatus,
	{ label: string; className: string }
> = {
	not_started: {
		label: "Not started",
		className: "border-transparent bg-secondary text-secondary-foreground",
	},
	action_required: {
		label: "Action required",
		className:
			"border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
	},
	pending_review: {
		label: "Pending review",
		className:
			"border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
	},
	verified: {
		label: "Verified",
		className:
			"border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	},
	restricted: {
		label: "Restricted",
		className:
			"border-transparent bg-destructive text-white dark:bg-destructive/60",
	},
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
	const config = STATUS_CONFIG[status];
	return <Badge className={config.className}>{config.label}</Badge>;
};

const getButtonLabel = (status: ConnectStatus): string => {
	if (status === "verified") return "Open Stripe dashboard";
	if (status === "not_started") return "Set up payouts";
	return "Continue verification";
};

const PayoutsSection = () => {
	const { data: connectData, isLoading: connectLoading } =
		api.payment.getConnectStatus.useQuery();

	const { data: earningsData, isLoading: earningsLoading } =
		api.payment.getInstructorEarnings.useQuery();

	const onboardingMutation =
		api.payment.createConnectOnboardingLink.useMutation({
			onSuccess: ({ url }) => {
				window.location.href = url;
			},
			onError: () => {
				toast.error("Failed to start verification. Please try again.");
			},
		});

	const loginMutation = api.payment.createConnectLoginLink.useMutation({
		onSuccess: ({ url }) => {
			window.location.href = url;
		},
		onError: () => {
			toast.error("Failed to open Stripe dashboard. Please try again.");
		},
	});

	const handleAction = () => {
		if (!connectData) return;
		if (connectData.status === "verified") {
			loginMutation.mutate();
		} else {
			onboardingMutation.mutate();
		}
	};

	const isMutating = onboardingMutation.isPending || loginMutation.isPending;
	const status = connectData?.status;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Payouts &amp; verification</CardTitle>
				<CardDescription>
					Set up your Stripe account to receive payouts from course sales.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{connectLoading ? (
					<p className="text-muted-foreground text-sm">Loading…</p>
				) : status !== undefined ? (
					<>
						<div className="flex items-center gap-3">
							<span className="text-sm">Verification status:</span>
							<StatusBadge status={status} />
						</div>

						<Button
							disabled={isMutating}
							onClick={handleAction}
							size="sm"
							variant={status === "verified" ? "outline" : "default"}
						>
							{isMutating ? <Loader2 className="animate-spin" /> : null}
							{getButtonLabel(status)}
						</Button>

						{earningsLoading ? (
							<p className="text-muted-foreground text-sm">Loading earnings…</p>
						) : earningsData !== undefined ? (
							<div className="mt-2 rounded-md border">
								<dl className="divide-y text-sm">
									<div className="flex justify-between px-4 py-2.5">
										<dt className="text-muted-foreground">
											Available / transferred
										</dt>
										<dd className="font-medium">
											{formatPrice(earningsData.availableCents)}
										</dd>
									</div>
									<div className="flex justify-between px-4 py-2.5">
										<dt className="text-muted-foreground">Pending (owed)</dt>
										<dd className="font-medium">
											{formatPrice(earningsData.owedCents)}
										</dd>
									</div>
									<div className="flex justify-between px-4 py-2.5">
										<dt className="text-muted-foreground">Lifetime gross</dt>
										<dd className="font-medium">
											{formatPrice(earningsData.lifetimeGrossCents)}
										</dd>
									</div>
									<div className="flex justify-between px-4 py-2.5">
										<dt className="text-muted-foreground">
											Platform fees paid
										</dt>
										<dd className="font-medium">
											{formatPrice(earningsData.platformFeesCents)}
										</dd>
									</div>
								</dl>
							</div>
						) : null}
					</>
				) : null}
			</CardContent>
		</Card>
	);
};

export default PayoutsSection;
