import type { AchievementView } from "@/server/entities/student/achievements";
import { api } from "@/trpc/server";

const EMPTY: AchievementView[] = [];

const getAchievements = async (): Promise<AchievementView[]> => {
	try {
		return await api.student.getAchievements();
	} catch (error) {
		console.error("Error fetching student achievements:", error);
		return EMPTY;
	}
};

export default getAchievements;
