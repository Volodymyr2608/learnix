"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { MobileNavProviderProps } from "@/app/_components/Dashboard/Layout/components/MobileNavProvider/types";

type MobileNavContextValue = {
	open: boolean;
	setOpen: (open: boolean) => void;
};

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export const MobileNavProvider = ({ children }: MobileNavProviderProps) => {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is intentionally included to trigger effect on navigation
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	return (
		<MobileNavContext.Provider value={{ open, setOpen }}>
			{children}
		</MobileNavContext.Provider>
	);
};

export const useMobileNav = (): MobileNavContextValue => {
	const context = useContext(MobileNavContext);
	if (!context) {
		throw new Error("useMobileNav must be used within a MobileNavProvider");
	}
	return context;
};
