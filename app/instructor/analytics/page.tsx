import { redirect } from "next/navigation";
import AnalyticsOverview from "@/app/_components/Instructor/Analytics";
import { Role } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";

export default async function AnalyticsPage() {
	const session = await getSession();
	if (!session?.user) redirect("/sign-in");
	if (session.user.role !== Role.INSTRUCTOR) redirect("/dashboard");

	return <AnalyticsOverview />;
}
