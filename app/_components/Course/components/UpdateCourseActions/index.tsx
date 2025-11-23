import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import type { UpdateCourseActionsProps } from "@/app/_components/Course/components/UpdateCourseActions/types";
import type { CourseActionStatus } from "@/app/_components/Course/constants/courseActionStatus";
import { COURSE_ACTION_STATUS } from "@/app/_components/Course/constants/courseActionStatus";
import { prepareCoursePayload } from "@/app/_components/Course/helpers/preparePayload";
import uploadMedia from "@/app/_components/Course/helpers/uploadMedia";
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
	thumbnailUrl,
	previewVideoUrl,
}: UpdateCourseActionsProps) => {
	const { handleSubmit } = useFormContext<CourseSchemaInput>();
	const [actionStatus, setActionStatus] = useState<CourseActionStatus>(
		COURSE_ACTION_STATUS.IDLE,
	);

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
		onSettled: () => {
			setActionStatus(() => COURSE_ACTION_STATUS.IDLE);
		},
	});

	const onSubmit = async (
		data: CourseSchemaInput,
		finalStatus: CourseStatus,
	) => {
		setActionStatus(
			finalStatus === STATUS_COURSE_LIST.DRAFT
				? COURSE_ACTION_STATUS.SAVING
				: COURSE_ACTION_STATUS.PUBLISHING,
		);

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

		const { thumbnail, previewVideo, ...rest } = payload;

		const [newThumbnailUrl, newPreviewVideoUrl] = await Promise.all([
			thumbnail ? uploadMedia(thumbnail as File) : Promise.resolve(null),
			previewVideo ? uploadMedia(previewVideo as File) : Promise.resolve(null),
		]);

		const getFileUrl = (
			media: File | null | undefined,
			newUrl: string | null,
			fallbackUrl: string | null,
		) => {
			if (media === null) {
				// user removed file
				return null;
			}

			return media ? newUrl : fallbackUrl;
		};

		const updatedCourse = {
			...rest,
			id: validated.courseId,
			thumbnailUrl: getFileUrl(
				thumbnail as File | null | undefined,
				newThumbnailUrl,
				thumbnailUrl,
			),
			previewVideoUrl: getFileUrl(
				previewVideo as File | null | undefined,
				newPreviewVideoUrl,
				previewVideoUrl,
			),
		};

		await updateCourse.mutateAsync(updatedCourse);
	};

	const isStatusDraft = status === STATUS_COURSE_LIST.DRAFT;
	const isDisabled = actionStatus !== COURSE_ACTION_STATUS.IDLE;

	return (
		<div className="flex gap-2">
			<Button
				className="flex-1"
				disabled={isDisabled}
				onClick={handleSubmit((d: CourseSchemaInput) => onSubmit(d, status))}
				variant="outline"
			>
				{actionStatus === COURSE_ACTION_STATUS.SAVING
					? "Saving ..."
					: "Save Changes"}
			</Button>
			<Button
				className="flex-1"
				disabled={isDisabled}
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
