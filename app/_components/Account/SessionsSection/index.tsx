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
import { authClient } from "@/server/better-auth/client";

type SessionItem = {
	id: string;
	userAgent: string | null | undefined;
	createdAt: Date | string;
	ipAddress: string | null | undefined;
	token: string;
};

const SessionsSection = () => {
	const [sessions, setSessions] = useState<SessionItem[]>([]);
	const [loading, setLoading] = useState(true);
	const { data: currentSession } = authClient.useSession();

	const loadSessions = useCallback(async () => {
		const { data } = await authClient.listSessions();
		setSessions((data ?? []) as SessionItem[]);
		setLoading(false);
	}, []);

	useEffect(() => {
		void loadSessions();
	}, [loadSessions]);

	const revoke = async (token: string) => {
		const { error } = await authClient.revokeSession({ token });
		if (error) {
			toast.error("Failed to revoke session.");
			return;
		}
		toast.success("Session revoked.");
		void loadSessions();
	};

	const revokeOthers = async () => {
		const { error } = await authClient.revokeOtherSessions();
		if (error) {
			toast.error("Failed to revoke sessions.");
			return;
		}
		toast.success("All other sessions revoked.");
		void loadSessions();
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Active sessions</CardTitle>
				<CardDescription>
					Devices and browsers currently signed in.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{sessions.length > 1 && (
					<Button onClick={revokeOthers} size="sm" variant="outline">
						Sign out all others
					</Button>
				)}
				{loading ? (
					<p className="text-muted-foreground text-sm">Loading…</p>
				) : (
					<ul className="max-w-xl divide-y rounded-md border">
						{sessions.map((s) => {
							const isCurrent = s.token === currentSession?.session.token;
							return (
								<li
									className="flex items-center justify-between px-4 py-3"
									key={s.id}
								>
									<div className="space-y-0.5">
										<p className="text-sm">
											{s.userAgent ?? "Unknown browser"}
											{isCurrent && (
												<span className="ml-2 text-muted-foreground text-xs">
													(this device)
												</span>
											)}
										</p>
										<p className="text-muted-foreground text-xs">
											{s.ipAddress ?? "Unknown IP"} ·{" "}
											{new Date(s.createdAt).toLocaleDateString()}
										</p>
									</div>
									{!isCurrent && (
										<Button
											onClick={() => revoke(s.token)}
											size="sm"
											variant="outline"
										>
											Revoke
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

export default SessionsSection;
