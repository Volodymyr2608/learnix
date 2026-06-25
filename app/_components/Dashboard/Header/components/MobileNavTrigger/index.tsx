"use client";

import { PanelLeft } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import { useSidebar } from "@/app/_components/Dashboard/Layout/components/SidebarProvider";

export const MobileNavTrigger = () => {
	const { setMobileOpen } = useSidebar();

	return (
		<Button
			aria-label="Open navigation menu"
			className="md:hidden"
			onClick={() => setMobileOpen(true)}
			size="icon"
			variant="ghost"
		>
			<PanelLeft className="h-5 w-5" />
		</Button>
	);
};
