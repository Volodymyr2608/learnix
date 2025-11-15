import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { getSession } from "@/server/better-auth/server";

export default async function AuthLayout({
	children,
}: {
	children: ReactNode;
}) {
	const res = await getSession();

	if (res) {
		redirect(INSTRUCTOR_URLS.dashboard);
	}

	return <>{children}</>;
}
