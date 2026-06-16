import type { ReactNode } from "react";
import type {
	DashboardStats,
	StatDelta,
} from "@/server/entities/instructor/dashboard";

export type DashboardStatsCardsProps = {
	stats: DashboardStats;
};

export type StatCardProps = {
	label: string;
	value: string;
	icon: ReactNode;
	iconWrapperClassName: string;
	subline: ReactNode;
};

export type DeltaBadgeProps = {
	delta: StatDelta;
};
