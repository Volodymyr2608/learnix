import { redirect } from "next/navigation";
import DashboardLayout from "@/app/_components/Dashboard/Layout";
import { Role } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";

const DashboardRootLayout = async ({
	children,
}: {
	children: React.ReactNode;
}) => {
	const session = await getSession();

	if (!session?.user) {
		redirect("/sign-in");
	}

	if (session.user.role !== Role.STUDENT) {
		redirect("/dashboard");
	}

	return <DashboardLayout>{children}</DashboardLayout>;
};

export default DashboardRootLayout;
