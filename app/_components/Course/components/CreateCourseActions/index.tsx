import { Eye, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { AIAssistantButton } from "@/app/_components/Course/components/CreateCourseActions/components/AIAssistantButton";
import type { CourseActionStatus } from "@/app/_components/Course/constants/courseActionStatus";
import { COURSE_ACTION_STATUS } from "@/app/_components/Course/constants/courseActionStatus";
import uploadMedia from "@/app/_components/Course/helpers/uploadMedia";
import type { CourseStatus } from "@/generated/prisma";
import { STATUS_COURSE_LIST } from "@/lib/constants/statusCourse";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { authClient } from "@/server/better-auth/client";
import type { CourseSchemaInput } from "@/server/entities/course";
import { api } from "@/trpc/client";
import { prepareCoursePayload } from "../../helpers/preparePayload";

const CreateCourseActions = () => {
	const { handleSubmit } = useFormContext<CourseSchemaInput>();
	const session = authClient.useSession();
	const router = useRouter();

	const [status, setStatus] = useState<CourseActionStatus>(
		COURSE_ACTION_STATUS.IDLE,
	);

	const createCourse = api.course.create.useMutation({
		onSuccess: () => {
			toast.success("Course created successfully");
			router.push(INSTRUCTOR_URLS.courses);
		},
		onError: (err) => {
			toast.error(err.message);
		},
		onSettled: () => {
			setStatus(() => COURSE_ACTION_STATUS.IDLE);
		},
	});

	const onSubmit = async (data: CourseSchemaInput, status: CourseStatus) => {
		setStatus(
			status === STATUS_COURSE_LIST.DRAFT
				? COURSE_ACTION_STATUS.SAVING
				: COURSE_ACTION_STATUS.PUBLISHING,
		);

		const instructorId = session.data?.user.id;

		if (!instructorId) {
			console.error("Instructor id is missing");
			return null;
		}

		const payload = prepareCoursePayload({
			data,
			finalStatus: status,
			instructorId: instructorId,
			isNew: true,
		});

		const { thumbnail, previewVideo, ...rest } = payload;

		const [thumbnailUrl, previewVideoUrl] = await Promise.all([
			thumbnail ? uploadMedia(thumbnail as File) : Promise.resolve(null),
			previewVideo ? uploadMedia(previewVideo as File) : Promise.resolve(null),
		]);

		if (thumbnail && !thumbnailUrl) {
			toast.error("Thumbnail upload failed");
			setStatus(COURSE_ACTION_STATUS.IDLE);
			return;
		}

		if (previewVideo && !previewVideoUrl) {
			toast.error("Preview video upload failed");
			setStatus(COURSE_ACTION_STATUS.IDLE);
			return;
		}

		await createCourse.mutateAsync({
			...rest,
			thumbnailUrl,
			previewVideoUrl,
		});
	};

	const isDisabled = status !== COURSE_ACTION_STATUS.IDLE;

	return (
		<div className="flex gap-2">
			<AIAssistantButton />
			<Button variant="outline">
				<Eye className="mr-2 h-4 w-4" />
				Preview
			</Button>
			<Button
				disabled={isDisabled}
				onClick={handleSubmit((d: CourseSchemaInput) =>
					onSubmit(d, STATUS_COURSE_LIST.DRAFT),
				)}
				variant="outline"
			>
				{status === COURSE_ACTION_STATUS.SAVING ? "Saving…" : "Save as Draft"}
			</Button>
			<Button
				disabled={isDisabled}
				onClick={handleSubmit((d: CourseSchemaInput) =>
					onSubmit(d, STATUS_COURSE_LIST.PUBLISHED),
				)}
			>
				<Save className="mr-2 h-4 w-4" />
				{status === COURSE_ACTION_STATUS.PUBLISHING
					? "Publishing…"
					: "Publish Course"}
			</Button>
		</div>
	);
};

export default CreateCourseActions;
