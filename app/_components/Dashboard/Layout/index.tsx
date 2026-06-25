import { cookies } from "next/headers";
import type { PropsWithChildren } from "react";

import DashboardHeader from "@/app/_components/Dashboard/Header";
import { DashboardShell } from "@/app/_components/Dashboard/Layout/components/DashboardShell";
import {
	SIDEBAR_COLLAPSED_COOKIE,
	SidebarProvider,
} from "@/app/_components/Dashboard/Layout/components/SidebarProvider";
import DashboardSidebar from "@/app/_components/Dashboard/Sidebar";

const DashboardLayout = async ({ children }: PropsWithChildren) => {
	const cookieStore = await cookies();
	const initialCollapsed =
		cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "true";

	return (
		<SidebarProvider initialCollapsed={initialCollapsed}>
			<DashboardShell sidebar={<DashboardSidebar />}>
				<DashboardHeader />
				<main className="flex-1 overflow-y-auto bg-muted/30 p-6">
					{children}
				</main>
			</DashboardShell>
		</SidebarProvider>
	);
};

export default DashboardLayout;
