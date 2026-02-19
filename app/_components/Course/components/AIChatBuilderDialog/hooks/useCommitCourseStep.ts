import { toast } from "sonner";
import { api } from "@/trpc/client";

export const useCommitCourseStep = () => {
	const utils = api.useUtils();

	const commitStep = api.courseAI.acceptStep.useMutation({
		onError: (err) => {
			toast.error(err.message);
		},
		onSettled: () => {
			utils.courseAI.getGenerationStatus.invalidate();
		},
	});

	return { commitStep, isCommitStepPending: commitStep.isPending };
};
