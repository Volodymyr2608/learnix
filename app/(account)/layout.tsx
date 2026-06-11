import { redirect } from "next/navigation";
import DashboardLayout from "@/app/_components/Dashboard/Layout";
import { getSession } from "@/server/better-auth/server";

const AccountLayout = async ({ children }: { children: React.ReactNode }) => {
	const session = await getSession();

	if (!session?.user) {
		redirect("/sign-in");
	}

	return <DashboardLayout>{children}</DashboardLayout>;
};

export default AccountLayout;
