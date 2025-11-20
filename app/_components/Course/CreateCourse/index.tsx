"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Eye, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import BasicInformationForm from "@/app/_components/Course/BasicInformationForm";
import CourseMediaForm from "@/app/_components/Course/CourseMediaForm";
import CurriculumForm from "@/app/_components/Course/CurriculumForm";
import LearningObjectivesForm from "@/app/_components/Course/ObjectivesForm";
import PricesForm from "@/app/_components/Course/PricesForm";
import RequirementsForm from "@/app/_components/Course/RequirementsForm";
import StatusCourse from "@/app/_components/Course/StatusCourse";
import Tips from "@/app/_components/Course/Tips";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { authClient } from "@/server/better-auth/client";
import { type CoursePayload, courseSchema } from "@/server/entities/course";
import { api } from "@/trpc/client";

const CreateCourse = () => {
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

	const methods = useForm({
		resolver: zodResolver(courseSchema),
		defaultValues: {
			title: "",
			subtitle: "",
			description: "",
			category: "",
			level: "",
			language: "",
			duration: "",
			price: "",
			originalPrice: "",
			thumbnail: undefined,
			previewVideo: undefined,
			objectives: [{ value: "" }, { value: "" }, { value: "" }, { value: "" }],
			requirements: [{ value: "" }, { value: "" }],
			sections: [
				{
					title: "",
					lessons: [{ title: "", duration: "" }],
				},
			],
		},
	});

	const onSaveAsDraft = async (data: CoursePayload) => {
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

		await createCourse.mutateAsync({
			...rest,
			objectives,
			requirements,
			status: "draft",
			instructorId: session.data.user.id,
			thumbnailUrl: "http://localhost:3000/web-development-concept.png",
		});
	};

	const onPublishCourse = () => {
		console.log("Publishing course...");
	};

	return (
		<FormProvider {...methods}>
			<form className="space-y-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Link href={INSTRUCTOR_URLS.courses}>
							<Button size="icon" variant="ghost">
								<ArrowLeft className="h-4 w-4" />
							</Button>
						</Link>
						<div>
							<h1 className="font-bold text-3xl tracking-tight">
								Create New Course
							</h1>
							<p className="text-muted-foreground">
								Fill in the details to create your course
							</p>
						</div>
					</div>
					<div className="flex gap-2">
						<Button variant="outline">
							<Eye className="mr-2 h-4 w-4" />
							Preview
						</Button>
						<Button
							onClick={methods.handleSubmit(onSaveAsDraft)}
							variant="outline"
						>
							Save as Draft
						</Button>
						<Button onClick={methods.handleSubmit(onPublishCourse)}>
							<Save className="mr-2 h-4 w-4" />
							Publish Course
						</Button>
					</div>
				</div>
				<div className="grid gap-6 lg:grid-cols-3">
					<div className="space-y-6 lg:col-span-2">
						<BasicInformationForm />
						<CourseMediaForm />
						<LearningObjectivesForm />
						<RequirementsForm />
						<CurriculumForm />
					</div>

					<div className="space-y-6">
						<PricesForm />
						<StatusCourse status="draft" />
						<Tips />
					</div>
				</div>
			</form>
		</FormProvider>
	);
};

export default CreateCourse;
