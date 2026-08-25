import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { AchievementView } from "@/server/entities/student/achievements";
import { api } from "@/trpc/server";

const EMPTY: AchievementView[] = [];

const getAchievements = async (): Promise<AchievementView[]> => {
	return safeRequest(
		"student.getAchievements",
		async () => {
			return await api.student.getAchievements();
		},
		EMPTY,
	);
};

export default getAchievements;
