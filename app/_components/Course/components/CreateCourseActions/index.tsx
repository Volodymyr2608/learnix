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

		if (!session.data?.user.id) {
			console.error("User id is missing");
			return;
		}

		await createCourse.mutateAsync({
			...rest,
			subtitle: subtitle ?? null,
			originalPrice: originalPrice ?? null,
			objectives,
			requirements,
			status: STATUS_COURSE_LIST.DRAFT,
			instructorId: session.data.user.id,
			thumbnailUrl: "/web-development-concept.png",
		});
	};

	const onPublishCourse = () => {
		console.log("Publishing course...");
	};

	return (
		<div className="flex gap-2">
			<Button variant="outline">
				<Eye className="mr-2 h-4 w-4" />
				Preview
			</Button>
			<Button onClick={handleSubmit(onSaveAsDraft)} variant="outline">
				Save as Draft
			</Button>
			<Button onClick={handleSubmit(onPublishCourse)}>
				<Save className="mr-2 h-4 w-4" />
				Publish Course
			</Button>
		</div>
	);
};

export default CreateCourseActions;
