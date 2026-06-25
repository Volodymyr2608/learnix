"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { SidebarProviderProps } from "@/app/_components/Dashboard/Layout/components/SidebarProvider/types";

export const SIDEBAR_COLLAPSED_COOKIE = "sidebar-collapsed";

type SidebarContextValue = {
	mobileOpen: boolean;
	setMobileOpen: (open: boolean) => void;
	collapsed: boolean;
	setCollapsed: (collapsed: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const SidebarProvider = ({
	children,
	initialCollapsed,
}: SidebarProviderProps) => {
	const [mobileOpen, setMobileOpen] = useState(false);
	const [collapsed, setCollapsedState] = useState(initialCollapsed);
	const pathname = usePathname();

	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is intentionally included to trigger effect on navigation
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname]);

	const setCollapsed = (value: boolean) => {
		setCollapsedState(value);
		// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API isn't supported in Safari/Firefox yet
		document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${value}; path=/; max-age=31536000`;
	};

	return (
		<SidebarContext.Provider
			value={{ collapsed, mobileOpen, setCollapsed, setMobileOpen }}
		>
			{children}
		</SidebarContext.Provider>
	);
};

export const useSidebar = (): SidebarContextValue => {
	const context = useContext(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider");
	}
	return context;
};
