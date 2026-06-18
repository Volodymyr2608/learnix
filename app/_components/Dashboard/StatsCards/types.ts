import type { ReactNode } from "react";
import type { StatDelta } from "@/lib/stats/statDelta";
import type { StudentDashboardStats } from "@/server/entities/student/dashboard";

export type DashboardStatsCardsProps = { stats: StudentDashboardStats };

export type StatCardProps = {
	label: string;
	value: string;
	icon: ReactNode;
	subline: ReactNode;
};

export type DeltaBadgeProps = { delta: StatDelta };
