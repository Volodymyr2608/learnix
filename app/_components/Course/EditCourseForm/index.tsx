"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save, Upload } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Label } from "@/app/_components/_shared/ui/label";
import BasicInformationForm from "@/app/_components/Course/BasicInformationForm";
import CurriculumForm from "@/app/_components/Course/CurriculumForm";
import type { EditCourseFormProps } from "@/app/_components/Course/EditCourseForm/types";
import LearningObjectivesForm from "@/app/_components/Course/ObjectivesForm";
import PricesForm from "@/app/_components/Course/PricesForm";
import RequirementsForm from "@/app/_components/Course/RequirementsForm";
import StatsCourse from "@/app/_components/Course/StatsCourse";
import StatusCourse from "@/app/_components/Course/StatusCourse";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { authClient } from "@/server/better-auth/client";
import { type CoursePayload, courseSchema } from "@/server/entities/course";
import { api } from "@/trpc/client";

export function EditCourseForm({ course }: EditCourseFormProps) {
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
	const methods = useForm({
		resolver: zodResolver(courseSchema),
		defaultValues: {
			title: course.title,
			subtitle: course.subtitle,
			description: course.description,
			category: course.category,
			level: course.level,
			language: course.language,
			duration: course.duration,
			price: course.price,
			originalPrice: course.originalPrice,
			thumbnail: undefined,
			previewVideo: undefined,
			objectives: course.objectives,
			requirements: course.requirements,
			sections: course.sections,
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
		<FormProvider {...methods}>
			<div className="grid gap-6 lg:grid-cols-3">
				{/* Main Content */}
				<div className="space-y-6 lg:col-span-2">
					<BasicInformationForm isEdit />

					<Card>
						<CardHeader>
							<CardTitle>Course Media</CardTitle>
							<CardDescription>
								Update course thumbnail and preview video
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label>Current Thumbnail</Label>
								<div className="relative aspect-video w-full overflow-hidden rounded-lg border">
									<Image
										alt="Course thumbnail"
										className="h-full w-full object-cover"
										fill
										src="/web-development-concept.png"
									/>
								</div>
								<Button size="sm" variant="outline">
									<Upload className="mr-2 h-4 w-4" />
									Change Thumbnail
								</Button>
							</div>

							<div className="space-y-2">
								<Label>Preview Video</Label>
								<div className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary">
									<Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
									<p className="text-muted-foreground text-sm">
										Click to upload or drag and drop
									</p>
									<p className="mt-1 text-muted-foreground text-xs">
										MP4, MOV up to 100MB
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<LearningObjectivesForm isEdit />

					<RequirementsForm />

					<CurriculumForm courseId={course.id} isEdit />
				</div>

				{/* Sidebar */}
				<div className="space-y-6">
					<PricesForm />

					<StatusCourse status={course.status} />

					<StatsCourse />

					<div className="flex gap-2">
						<Button
							className="flex-1"
							onClick={methods.handleSubmit(onSaveChanges)}
							variant="outline"
						>
							Save Changes
						</Button>
						<Button
							className="flex-1"
							onClick={methods.handleSubmit(onPublishCourse)}
						>
							<Save className="mr-2 h-4 w-4" />
							Update & Publish
						</Button>
					</div>
				</div>
			</div>
		</FormProvider>
	);
}
