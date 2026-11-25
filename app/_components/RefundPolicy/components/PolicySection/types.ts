import type { LucideIcon } from "lucide-react";

export type PolicySectionProps = {
	id: string;
	icon: LucideIcon;
	title: string;
	points: readonly string[];
};
