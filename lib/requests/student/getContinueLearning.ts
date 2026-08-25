import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { ContinueLearningItem } from "@/server/entities/student/dashboard";
import { api } from "@/trpc/server";

const getContinueLearning = async (): Promise<ContinueLearningItem[]> => {
	return safeRequest("student.getContinueLearning", async () => {
		return await api.student.getContinueLearning();
	}, []);
};

export default getContinueLearning;
