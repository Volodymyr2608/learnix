import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Role } from "@/generated/prisma";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { getSession } from "@/server/better-auth/server";

export default async function AuthLayout({
	children,
}: {
	children: ReactNode;
}) {
	const res = await getSession();

	if (res) {
		if (res.user.role === Role.STUDENT) {
			redirect(STUDENT_URLS.dashboard);
		} else if (res.user.role === Role.INSTRUCTOR) {
			redirect(INSTRUCTOR_URLS.dashboard);
		}
	}

	return <>{children}</>;
}
