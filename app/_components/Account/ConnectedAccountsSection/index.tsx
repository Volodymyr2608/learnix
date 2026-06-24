"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { authClient } from "@/server/better-auth/client";

type Account = { id: string; providerId: string; accountId: string };

const PROVIDER_LABELS: Record<string, string> = {
	github: "GitHub",
	google: "Google",
	credential: "Email & Password",
};

const ConnectedAccountsSection = () => {
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [loading, setLoading] = useState(true);

	const loadAccounts = useCallback(async () => {
		const { data } = await authClient.listAccounts();
		setAccounts((data ?? []) as Account[]);
		setLoading(false);
	}, []);

	useEffect(() => {
		void loadAccounts();
	}, [loadAccounts]);

	const handleLink = async (provider: "github" | "google") => {
		await authClient.linkSocial({
			provider,
			callbackURL: STUDENT_URLS.settings,
		});
	};

	const handleUnlink = async (account: Account) => {
		if (accounts.length <= 1) {
			toast.error("You must keep at least one sign-in method.");
			return;
		}
		const { error } = await authClient.unlinkAccount({
			providerId: account.providerId,
		});
		if (error) {
			toast.error(error.message ?? "Failed to unlink account.");
			return;
		}
		toast.success(
			`${PROVIDER_LABELS[account.providerId] ?? account.providerId} unlinked.`,
		);
		void loadAccounts();
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Connected accounts</CardTitle>
				<CardDescription>
					Link social accounts for faster sign-in.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{loading ? (
					<p className="text-muted-foreground text-sm">Loading…</p>
				) : (
					<ul className="max-w-md divide-y rounded-md border">
						{(["github", "google"] as const).map((provider) => {
							const account = accounts.find((a) => a.providerId === provider);
							return (
								<li
									className="flex items-center justify-between px-4 py-3"
									key={provider}
								>
									<span className="font-medium text-sm">
										{PROVIDER_LABELS[provider]}
									</span>
									{account ? (
										<Button
											onClick={() => handleUnlink(account)}
											size="sm"
											variant="outline"
										>
											Unlink
										</Button>
									) : (
										<Button
											onClick={() => handleLink(provider)}
											size="sm"
											variant="outline"
										>
											Link
										</Button>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
};

export default ConnectedAccountsSection;
