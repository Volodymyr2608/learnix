import type { PathStep } from "@/server/services/learningPathAI/schemas/learningPath.schema";

export type PathStepRowProps = {
	step: PathStep;
	courseId: string;
};
