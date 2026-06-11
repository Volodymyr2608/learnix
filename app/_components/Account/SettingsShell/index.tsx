"use client";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/app/_components/_shared/ui/tabs";
import EmailSection from "@/app/_components/Account/EmailSection";
import NotificationsSection from "@/app/_components/Account/NotificationsSection";
import SessionsSection from "@/app/_components/Account/SessionsSection";
import type { SettingsShellProps } from "@/app/_components/Account/SettingsShell/types";

const SettingsShell = ({ emailNotificationsEnabled }: SettingsShellProps) => {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-2xl">Settings</h1>
				<p className="text-muted-foreground">
					Manage your email, notifications, and active sessions.
				</p>
			</div>

			<Tabs defaultValue="email">
				<TabsList>
					<TabsTrigger value="email">Email</TabsTrigger>
					<TabsTrigger value="notifications">Notifications</TabsTrigger>
					<TabsTrigger value="sessions">Sessions</TabsTrigger>
				</TabsList>

				<TabsContent className="mt-6" value="email">
					<EmailSection />
				</TabsContent>

				<TabsContent className="mt-6" value="notifications">
					<NotificationsSection initialEnabled={emailNotificationsEnabled} />
				</TabsContent>

				<TabsContent className="mt-6" value="sessions">
					<SessionsSection />
				</TabsContent>
			</Tabs>
		</div>
	);
};

export default SettingsShell;
