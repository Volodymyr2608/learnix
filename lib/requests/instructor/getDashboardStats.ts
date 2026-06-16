import type { DashboardStats } from "@/server/entities/instructor/dashboard";
import { api } from "@/trpc/server";

const EMPTY_STATS: DashboardStats = {
	revenue: { totalCents: 0, delta: { kind: "none" } },
	students: { total: 0, delta: { kind: "none" } },
	courses: { published: 0, drafts: 0 },
	rating: { average: null, reviewCount: 0 },
};

const getDashboardStats = async (): Promise<DashboardStats> => {
	try {
		return await api.instructor.getDashboardStats();
	} catch (error) {
		console.error("Error fetching instructor dashboard stats:", error);
		return EMPTY_STATS;
	}
};

export default getDashboardStats;
