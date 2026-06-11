"use client";

import ConnectedAccountsSection from "@/app/_components/Account/ConnectedAccountsSection";
import DangerZoneSection from "@/app/_components/Account/DangerZoneSection";
import PasswordSection from "@/app/_components/Account/PasswordSection";
import ProfileSection from "@/app/_components/Account/ProfileSection";

const ProfileShell = () => {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-2xl">Profile</h1>
				<p className="text-muted-foreground">
					Manage your personal information, password, and account security.
				</p>
			</div>

			<ProfileSection />
			<PasswordSection />
			<ConnectedAccountsSection />
			<DangerZoneSection />
		</div>
	);
};

export default ProfileShell;
