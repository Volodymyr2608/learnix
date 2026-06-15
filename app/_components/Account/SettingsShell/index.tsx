"use client";

import EmailSection from "@/app/_components/Account/EmailSection";
import NotificationsSection from "@/app/_components/Account/NotificationsSection";
import PayoutsSection from "@/app/_components/Account/PayoutsSection";
import SessionsSection from "@/app/_components/Account/SessionsSection";
import type { SettingsShellProps } from "@/app/_components/Account/SettingsShell/types";

const SettingsShell = ({
	emailNotificationsEnabled,
	isInstructor,
}: SettingsShellProps) => {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-2xl">Settings</h1>
				<p className="text-muted-foreground">
					Manage your email, notifications, and active sessions.
				</p>
			</div>

			<EmailSection />
			<NotificationsSection initialEnabled={emailNotificationsEnabled} />
			{isInstructor && <PayoutsSection />}
			<SessionsSection />
		</div>
	);
};

export default SettingsShell;
