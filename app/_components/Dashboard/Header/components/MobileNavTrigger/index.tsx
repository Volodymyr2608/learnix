"use client";

import { Menu } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import { useMobileNav } from "@/app/_components/Dashboard/Layout/components/MobileNavProvider";

export const MobileNavTrigger = () => {
	const { setOpen } = useMobileNav();

	return (
		<Button
			aria-label="Open navigation menu"
			className="md:hidden"
			onClick={() => setOpen(true)}
			size="icon"
			variant="ghost"
		>
			<Menu className="h-5 w-5" />
		</Button>
	);
};
