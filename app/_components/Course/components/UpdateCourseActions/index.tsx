import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import type { UpdateCourseActionsProps } from "@/app/_components/Course/components/UpdateCourseActions/types";
import { prepareCoursePayload } from "@/app/_components/Course/helpers/preparePayload";
import { validateProceed } from "@/app/_components/Course/helpers/validateProceed";
import type { CourseStatus } from "@/generated/prisma";
import { STATUS_COURSE_LIST } from "@/lib/constants/statusCourse";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { authClient } from "@/server/better-auth/client";
import type { CourseSchemaInput } from "@/server/entities/course";
import { api } from "@/trpc/client";

const UpdateCourseActions = ({
	courseId,
	status,
}: UpdateCourseActionsProps) => {
	const { handleSubmit } = useFormContext<CourseSchemaInput>();

	const session = authClient.useSession();
	const router = useRouter();
	const updateCourse = api.course.update.useMutation({
		onSuccess: () => {
			toast.success("Course updated successfully");
			router.push(INSTRUCTOR_URLS.courses);
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	const onSubmit = async (
		data: CourseSchemaInput,
		finalStatus: CourseStatus,
	) => {
		const validated = validateProceed({
			courseId,
			instructorId: session.data?.user.id,
		});

		if (!validated) return;

		const payload = prepareCoursePayload({
			data,
			finalStatus,
			instructorId: validated.instructorId,
			courseId: validated.courseId,
		});

		await updateCourse.mutateAsync({
			...payload,
			id: validated.courseId,
		});
	};

	const isStatusDraft = status === STATUS_COURSE_LIST.DRAFT;

	return (
		<div className="flex gap-2">
			<Button
				className="flex-1"
				disabled={updateCourse.isPending}
				onClick={handleSubmit((d: CourseSchemaInput) => onSubmit(d, status))}
				variant="outline"
			>
				Save Changes
			</Button>
			<Button
				className="flex-1"
				disabled={updateCourse.isPending}
				onClick={handleSubmit((d: CourseSchemaInput) =>
					onSubmit(
						d,
						isStatusDraft
							? STATUS_COURSE_LIST.PUBLISHED
							: STATUS_COURSE_LIST.DRAFT,
					),
				)}
			>
				<Save className="mr-2 h-4 w-4" />
				Update & {isStatusDraft ? "Publish" : "Unpublish"}
			</Button>
		</div>
	);
};

export default UpdateCourseActions;
