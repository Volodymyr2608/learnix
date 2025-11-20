import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { authClient } from "@/server/better-auth/client";
import type { CoursePayload } from "@/server/entities/course";
import { api } from "@/trpc/client";

const UpdateCourseActions = () => {
	const { handleSubmit } = useFormContext();

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

	const onSaveChanges = async (data: CoursePayload) => {
		const {
			objectives: objList,
			requirements: reqList,
			previewVideo,
			thumbnail,
			...rest
		} = data;

		console.log(previewVideo, thumbnail);

		const objectives = objList.map(({ value }) => value.trim());
		const requirements = reqList.map(({ value }) => value.trim());

		await updateCourse.mutateAsync({
			...rest,
			id: course.id,
			objectives,
			requirements,
			status: course.status,
			instructorId: session.data.user.id,
			thumbnailUrl: "/web-development-concept.png",
		});
	};

	const onPublishCourse = async (data: CoursePayload) => {
		const {
			objectives: objList,
			requirements: reqList,
			previewVideo,
			thumbnail,
			...rest
		} = data;

		console.log(previewVideo, thumbnail);

		const objectives = objList.map(({ value }) => value.trim());
		const requirements = reqList.map(({ value }) => value.trim());

		await updateCourse.mutateAsync({
			...rest,
			id: course.id,
			objectives,
			requirements,
			status: "published",
			instructorId: session.data.user.id,
			thumbnailUrl: "/web-development-concept.png",
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
