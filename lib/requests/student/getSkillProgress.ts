import type { SkillProgressView } from "@/server/entities/student/skillProgress";
import { api } from "@/trpc/server";

const EMPTY: SkillProgressView[] = [];

const getSkillProgress = async (): Promise<SkillProgressView[]> => {
	try {
		return await api.student.getSkillProgress();
	} catch (error) {
		console.error("Error fetching student skill progress:", error);
		return EMPTY;
	}
};

export default getSkillProgress;
