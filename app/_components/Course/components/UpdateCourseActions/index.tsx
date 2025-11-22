import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import type { UpdateCourseActionsProps } from "@/app/_components/Course/components/UpdateCourseActions/types";
import { STATUS_COURSE_LIST } from "@/lib/constants/statusCourse";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { authClient } from "@/server/better-auth/client";
import type {
	CoursePayload,
	CourseSchemaInput,
} from "@/server/entities/course";
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

	const onSaveChanges = async (data: CourseSchemaInput) => {
		if (!courseId) {
			console.error("Course id not exist");
			return;
		}

		if (!session.data?.user.id) {
			console.error("User id is missing");
			return;
		}

		const {
			objectives: objList,
			requirements: reqList,
			previewVideo,
			thumbnail,
			subtitle,
			originalPrice,
			...rest
		} = data;

		console.log(previewVideo, thumbnail);

		const objectives = objList.map(({ value }) => value.trim());
		const requirements = reqList.map(({ value }) => value.trim());

		await updateCourse.mutateAsync({
			...rest,
			id: courseId,
			objectives,
			requirements,
			status,
			instructorId: session.data.user.id,
			thumbnailUrl: "/web-development-concept.png",
			subtitle: subtitle ?? null,
			originalPrice: originalPrice ?? null,
		});
	};

	const onPublishCourse = async (data: CoursePayload) => {
		if (!courseId) {
			console.error("Course id not exist");
			return;
		}

		if (!session.data?.user.id) {
			console.error("User id is missing");
			return;
		}

		const {
			objectives: objList,
			requirements: reqList,
			previewVideo,
			thumbnail,
			subtitle,
			originalPrice,
			...rest
		} = data;

		console.log(previewVideo, thumbnail);

		const objectives = objList.map(({ value }) => value.trim());
		const requirements = reqList.map(({ value }) => value.trim());

		await updateCourse.mutateAsync({
			...rest,
			id: courseId,
			objectives,
			requirements,
			status: STATUS_COURSE_LIST.PUBLISHED,
			instructorId: session.data.user.id,
			thumbnailUrl: "/web-development-concept.png",
			subtitle: subtitle ?? null,
			originalPrice: originalPrice ?? null,
		});
	};

	return (
		<div className="flex gap-2">
			<Button
				className="flex-1"
				onClick={handleSubmit(onSaveChanges)}
				variant="outline"
			>
				Save Changes
			</Button>
			<Button className="flex-1" onClick={handleSubmit(onPublishCourse)}>
				<Save className="mr-2 h-4 w-4" />
				Update & Publish
			</Button>
		</div>
	);
};

export default UpdateCourseActions;
