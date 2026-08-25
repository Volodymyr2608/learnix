import type { ReactNode } from "react";

export type CollapsibleSectionProps = {
	title: string;
	children: ReactNode;
	defaultOpen?: boolean;
};
