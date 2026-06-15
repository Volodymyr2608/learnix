"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { getButtonLabel } from "@/app/_components/Account/PayoutsSection/helpers";
import type { PayoutsActionButtonProps } from "@/app/_components/Account/PayoutsSection/types";
import { api } from "@/trpc/client";

export function PayoutsActionButton({ status }: PayoutsActionButtonProps) {
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
			window.open(url, "_blank", "noopener,noreferrer");
		},
		onError: () => {
			toast.error("Failed to open Stripe dashboard. Please try again.");
		},
	});

	if (status === "verified") {
		return (
			<Button
				disabled={loginMutation.isPending}
				onClick={() => loginMutation.mutate()}
				size="sm"
				variant="outline"
			>
				{loginMutation.isPending ? (
					<Loader2 className="animate-spin" />
				) : (
					<ExternalLink className="h-4 w-4" />
				)}
				Open Stripe dashboard
			</Button>
		);
	}

	return (
		<Button
			disabled={onboardingMutation.isPending}
			onClick={() => onboardingMutation.mutate()}
			size="sm"
		>
			{onboardingMutation.isPending && <Loader2 className="animate-spin" />}
			{getButtonLabel(status)}
		</Button>
	);
}