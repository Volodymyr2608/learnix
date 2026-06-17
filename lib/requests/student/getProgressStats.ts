import type { StudentProgressStats } from "@/server/entities/student/progress";
import { api } from "@/trpc/server";

const EMPTY: StudentProgressStats = {
  totalMinutes: 0,
  totalHoursDelta: { kind: "none" },
  coursesCompleted: { total: 0, delta: { kind: "none" } },
  currentStreakDays: 0,
  avgDailyMinutes: 0,
  weeklyActivity: [],
};

const getProgressStats = async (): Promise<StudentProgressStats> => {
  try {
    return await api.student.getProgressStats();
  } catch (error) {
    console.error("Error fetching student progress stats:", error);
    return EMPTY;
  }
};

export default getProgressStats;