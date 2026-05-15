import type { PathStep } from "@/server/services/learningPathAI/schemas/learningPath.schema";

export const getTypeLabel = (type: PathStep["type"]): string => {
	switch (type) {
		case "NEW_LESSON":
			return "New";
		case "REVIEW_LESSON":
			return "Review";
		default:
			return "Retry quiz";
	}
};
