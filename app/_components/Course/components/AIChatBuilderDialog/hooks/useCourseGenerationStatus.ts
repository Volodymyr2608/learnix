import { toast } from "sonner";
import type { CourseGenerationStatus } from "@/generated/prisma";
import { api } from "@/trpc/client";

export const useCourseGenerationStatus = () => {
	const { mutateAsync, isPending } =
		api.courseAI.setCourseGenerationStatus.useMutation({
			onError: (error) => {
				toast.error(error.message);
			},
		});

	const setStatus = async (id: string, status: CourseGenerationStatus) => {
		await mutateAsync({ id, status });
	};

	return {
		setStatus,
		isPending,
	};
};
