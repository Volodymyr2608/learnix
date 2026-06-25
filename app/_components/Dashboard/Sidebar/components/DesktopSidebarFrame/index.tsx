"use client";

import { useSidebar } from "@/app/_components/Dashboard/Layout/components/SidebarProvider";
import type { DesktopSidebarFrameProps } from "@/app/_components/Dashboard/Sidebar/components/DesktopSidebarFrame/types";
import { SidebarContent } from "@/app/_components/Dashboard/Sidebar/components/SidebarContent";
import { cn } from "@/lib/utils/cn";

export const DesktopSidebarFrame = (props: DesktopSidebarFrameProps) => {
	const { collapsed } = useSidebar();

	return (
		<aside
			className={cn(
				"fixed top-0 left-0 z-40 hidden h-screen border-sidebar-border border-r bg-sidebar md:block",
				collapsed ? "w-16" : "w-64",
			)}
		>
			<SidebarContent collapsed={collapsed} {...props} />
		</aside>
	);
};
