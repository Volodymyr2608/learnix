import type { ContinueLearningItem } from "@/server/entities/student/dashboard";
import { api } from "@/trpc/server";

const getContinueLearning = async (): Promise<ContinueLearningItem[]> => {
	try {
		return await api.student.getContinueLearning();
	} catch (error) {
		console.error("Error fetching continue-learning list:", error);
		return [];
	}
};

export default getContinueLearning;
