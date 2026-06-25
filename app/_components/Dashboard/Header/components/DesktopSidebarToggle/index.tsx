"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import { useSidebar } from "@/app/_components/Dashboard/Layout/components/SidebarProvider";

export const DesktopSidebarToggle = () => {
	const { collapsed, setCollapsed } = useSidebar();

	return (
		<Button
			aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
			className="hidden md:flex"
			onClick={() => setCollapsed(!collapsed)}
			size="icon"
			variant="ghost"
		>
			{collapsed ? (
				<PanelLeftOpen className="h-5 w-5" />
			) : (
				<PanelLeftClose className="h-5 w-5" />
			)}
		</Button>
	);
};
