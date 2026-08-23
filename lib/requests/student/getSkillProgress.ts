import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { SkillProgressView } from "@/server/entities/student/skillProgress";
import { api } from "@/trpc/server";

const EMPTY: SkillProgressView[] = [];

const getSkillProgress = async (): Promise<SkillProgressView[]> => {
	return safeRequest(
		"student.getSkillProgress",
		async () => {
			return await api.student.getSkillProgress();
		},
		EMPTY,
	);
};

export default getSkillProgress;
