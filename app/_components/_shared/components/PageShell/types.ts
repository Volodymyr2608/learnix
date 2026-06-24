import type { LucideIcon } from "lucide-react";

export type PageShellProps = {
	title: string;
	description: string;
	icon?: LucideIcon;
	iconClassName?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
};
