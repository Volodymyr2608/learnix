import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import DASHBOARD_URLS from "@/lib/constants/urls/dashboardUrls";
import { getSession } from "@/server/better-auth/server";

export default async function AuthLayout({
	children,
}: {
	children: ReactNode;
}) {
	const res = await getSession();

	if (res) {
		redirect(DASHBOARD_URLS.dashboard);
	}

	return <>{children}</>;
}
