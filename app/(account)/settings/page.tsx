import { redirect } from "next/navigation";
import SettingsShell from "@/app/_components/Account/SettingsShell";
import { getSession } from "@/server/better-auth/server";
import { userRepository } from "@/server/repositories/user.repository";

const SettingsPage = async () => {
	const session = await getSession();

	if (!session?.user) {
		redirect("/sign-in");
	}

	const user = await userRepository.findFirst({
		where: { id: session.user.id },
		select: { emailNotificationsEnabled: true },
	});

	return (
		<SettingsShell
			emailNotificationsEnabled={user?.emailNotificationsEnabled ?? true}
		/>
	);
};

export default SettingsPage;
