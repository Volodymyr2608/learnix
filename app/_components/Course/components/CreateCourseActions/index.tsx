import { Eye, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { STATUS_COURSE_LIST } from "@/lib/constants/statusCourse";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { authClient } from "@/server/better-auth/client";
import type { CourseSchemaInput } from "@/server/entities/course";
import { api } from "@/trpc/client";

import { prepareCoursePayload } from "../../helpers/preparePayload";
import { validateProceed } from "../../helpers/validateProceed";

const CreateCourseActions = () => {
	const { handleSubmit } = useFormContext<CourseSchemaInput>();
	const session = authClient.useSession();
	const router = useRouter();
	const createCourse = api.course.create.useMutation({
		onSuccess: () => {
			toast.success("Course created successfully");
			router.push(INSTRUCTOR_URLS.courses);
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	const onSaveAsDraft = async (data: CourseSchemaInput) => {
		const validated = validateProceed({
			instructorId: session.data?.user.id,
		});

		if (!validated) return;

		const payload = prepareCoursePayload({
			data,
			finalStatus: STATUS_COURSE_LIST.DRAFT,
			instructorId: validated.instructorId,
			isNew: true,
		});

		await createCourse.mutateAsync(payload);
	};

	const onPublishCourse = async (data: CourseSchemaInput) => {
		const validated = validateProceed({
			instructorId: session.data?.user.id,
		});

		if (!validated) return;

		const payload = prepareCoursePayload({
			data,
			finalStatus: STATUS_COURSE_LIST.PUBLISHED,
			instructorId: validated.instructorId,
			isNew: true,
		});

		await createCourse.mutateAsync(payload);
	};

	return (
		<div className="flex gap-2">
			<Button variant="outline">
				<Eye className="mr-2 h-4 w-4" />
				Preview
			</Button>
			<Button
				disabled={createCourse.isPending}
				onClick={handleSubmit(onSaveAsDraft)}
				variant="outline"
			>
				Save as Draft
			</Button>
			<Button
				disabled={createCourse.isPending}
				onClick={handleSubmit(onPublishCourse)}
			>
				<Save className="mr-2 h-4 w-4" />
				Publish Course
			</Button>
		</div>
	);
};

export default CreateCourseActions;
