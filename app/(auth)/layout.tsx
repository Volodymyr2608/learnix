import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import DASHBOARD_URLS from "@/lib/constants/urls/dashboardUrls";
import { getSession } from "@/server/better-auth/server";

export default async function AuthLayout({
	children,
}: {
	children: ReactNode;
}) {
	const { user } = await getSession();

	if (user) {
		redirect(DASHBOARD_URLS.DASHBOARD);
	}

	return <>{children}</>;
}
