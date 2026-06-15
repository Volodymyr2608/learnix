import SettingsShell from "@/app/_components/Account/SettingsShell";
import { Role } from "@/generated/prisma";
import requireAuth from "@/lib/utils/user/requireAuth";
import { getSession } from "@/server/better-auth/server";
import { userRepository } from "@/server/repositories/user.repository";

const SettingsPage = async () => {
	const { user } = requireAuth(await getSession());

	const data = await userRepository.findFirst({
		where: { id: user.id },
		select: { emailNotificationsEnabled: true },
	});

	return (
		<SettingsShell
			emailNotificationsEnabled={data?.emailNotificationsEnabled ?? true}
			isInstructor={user.role === Role.INSTRUCTOR}
		/>
	);
};

export default SettingsPage;
