"use client";

import type { DashboardShellProps } from "@/app/_components/Dashboard/Layout/components/DashboardShell/types";
import { useSidebar } from "@/app/_components/Dashboard/Layout/components/SidebarProvider";
import { cn } from "@/lib/utils/cn";

export const DashboardShell = ({ sidebar, children }: DashboardShellProps) => {
	const { collapsed } = useSidebar();

	return (
		<div className="flex h-screen overflow-hidden">
			{sidebar}
			<div
				className={cn(
					"flex flex-1 flex-col overflow-hidden",
					collapsed ? "md:pl-16" : "md:pl-64",
				)}
			>
				{children}
			</div>
		</div>
	);
};
