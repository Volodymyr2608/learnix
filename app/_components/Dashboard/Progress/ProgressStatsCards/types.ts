import type { ReactNode } from "react";
import type { StatDelta } from "@/lib/stats/statDelta";
import type { StudentProgressStats } from "@/server/entities/student/progress";

export type ProgressStatsCardsProps = { stats: StudentProgressStats };

export type StatCardProps = {
	label: string;
	value: string;
	icon: ReactNode;
	subline: ReactNode;
};

export type DeltaBadgeProps = { delta: StatDelta; period: "week" | "month" };
