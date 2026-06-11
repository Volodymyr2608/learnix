"use client";

import { Separator } from "@/app/_components/_shared/ui/separator";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/app/_components/_shared/ui/tabs";
import ConnectedAccountsSection from "@/app/_components/Account/ConnectedAccountsSection";
import DangerZoneSection from "@/app/_components/Account/DangerZoneSection";
import EmailSection from "@/app/_components/Account/EmailSection";
import NotificationsSection from "@/app/_components/Account/NotificationsSection";
import PasswordSection from "@/app/_components/Account/PasswordSection";
import ProfileSection from "@/app/_components/Account/ProfileSection";
import SessionsSection from "@/app/_components/Account/SessionsSection";
import type { SettingsShellProps } from "@/app/_components/Account/SettingsShell/types";

const SettingsShell = ({ emailNotificationsEnabled }: SettingsShellProps) => {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-2xl">Account settings</h1>
				<p className="text-muted-foreground">
					Manage your profile, security, and preferences.
				</p>
			</div>

			<Tabs defaultValue="profile">
				<TabsList>
					<TabsTrigger value="profile">Profile</TabsTrigger>
					<TabsTrigger value="security">Security</TabsTrigger>
					<TabsTrigger value="notifications">Notifications</TabsTrigger>
					<TabsTrigger value="accounts">Connected accounts</TabsTrigger>
					<TabsTrigger value="sessions">Sessions</TabsTrigger>
					<TabsTrigger value="danger">Danger zone</TabsTrigger>
				</TabsList>

				<TabsContent className="mt-6" value="profile">
					<ProfileSection />
				</TabsContent>

				<TabsContent className="mt-6 space-y-6" value="security">
					<PasswordSection />
					<Separator />
					<EmailSection />
				</TabsContent>

				<TabsContent className="mt-6" value="notifications">
					<NotificationsSection initialEnabled={emailNotificationsEnabled} />
				</TabsContent>

				<TabsContent className="mt-6" value="accounts">
					<ConnectedAccountsSection />
				</TabsContent>

				<TabsContent className="mt-6" value="sessions">
					<SessionsSection />
				</TabsContent>

				<TabsContent className="mt-6" value="danger">
					<DangerZoneSection />
				</TabsContent>
			</Tabs>
		</div>
	);
};

export default SettingsShell;
