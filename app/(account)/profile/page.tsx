import { redirect } from "next/navigation";
import ProfileShell from "@/app/_components/Account/ProfileShell";
import { getSession } from "@/server/better-auth/server";

const ProfilePage = async () => {
	const session = await getSession();

	if (!session?.user) {
		redirect("/sign-in");
	}

	return <ProfileShell />;
};

export default ProfilePage;
