"use client";

import {
	Sheet,
	SheetContent,
	SheetTitle,
} from "@/app/_components/_shared/ui/sheet";
import { useMobileNav } from "@/app/_components/Dashboard/Layout/components/MobileNavProvider";
import type { MobileSidebarSheetProps } from "@/app/_components/Dashboard/Sidebar/components/MobileSidebarSheet/types";

export const MobileSidebarSheet = ({ children }: MobileSidebarSheetProps) => {
	const { open, setOpen } = useMobileNav();

	return (
		<Sheet onOpenChange={setOpen} open={open}>
			<SheetContent
				className="w-64 gap-0 border-sidebar-border bg-sidebar p-0"
				side="left"
			>
				<SheetTitle className="sr-only">Navigation</SheetTitle>
				{children}
			</SheetContent>
		</Sheet>
	);
};
