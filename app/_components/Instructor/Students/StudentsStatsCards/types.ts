import type { LucideIcon } from "lucide-react";
import type { StudentStatusCounts } from "@/server/entities/instructor/students";

export type StudentsStatsCardsProps = {
	counts: StudentStatusCounts;
};

export type StatCardProps = {
	label: string;
	value: number;
	icon: LucideIcon;
	iconWrapClass: string;
	iconClass: string;
};
