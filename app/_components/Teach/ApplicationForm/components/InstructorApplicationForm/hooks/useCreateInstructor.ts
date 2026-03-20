import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";
import type { InstructorSchemaInput } from "@/server/entities/instructor";
import { api } from "@/trpc/client";

const useCreateInstructor = () => {
	const router = useRouter();

	const createCourse = api.instructor.create.useMutation({
		onSuccess: () => {
			router.push("/instructors/success");
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	const onSubmit = useCallback(async (data: InstructorSchemaInput) => {
		await createCourse.mutateAsync(data);
	}, [createCourse.mutateAsync]);

	return {
		isPending: createCourse.isPending,
		onSubmit,
	};
};

export default useCreateInstructor;
