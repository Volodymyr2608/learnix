import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { StudentDashboardStats } from "@/server/entities/student/dashboard";
import { api } from "@/trpc/server";

const EMPTY: StudentDashboardStats = {
	enrolledCourses: { total: 0, delta: { kind: "none" } },
	hoursLearned: { totalMinutes: 0, delta: { kind: "none" } },
	certificates: { total: 0, delta: { kind: "none" } },
	completionRate: { percent: 0 },
};

const getDashboardStats = async (): Promise<StudentDashboardStats> => {
	return safeRequest(
		"student.getDashboardStats",
		async () => {
			return await api.student.getDashboardStats();
		},
		EMPTY,
	);
};

export default getDashboardStats;
