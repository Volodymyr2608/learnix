"use client";

import { Upload } from "lucide-react";
import Image from "next/image";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Label } from "@/app/_components/_shared/ui/label";
import type { CourseBuilderProps } from "@/app/_components/Course/components/CourseBuilder/types";
import CourseFormProvider from "@/app/_components/Course/components/CourseFormProvider";
import CourseFormHeader from "@/app/_components/Course/components/CourseFormProvider/components/CourseFormHeader";
import CourseFormLayout from "@/app/_components/Course/components/CourseFormProvider/components/CourseFormLayout";
import ColumnLayout from "@/app/_components/Course/components/CourseFormProvider/components/CourseFormLayout/components/ColumnLayout";
import ColumnsLayout from "@/app/_components/Course/components/CourseFormProvider/components/CourseFormLayout/components/ColumnsLayout";
import CreateCourseActions from "@/app/_components/Course/components/CreateCourseActions";
import EditBanner from "@/app/_components/Course/components/EditBanner";
import BasicInformationForm from "@/app/_components/Course/components/FormCards/BasicInformationForm";
import CourseMediaForm from "@/app/_components/Course/components/FormCards/CourseMediaForm";
import CurriculumForm from "@/app/_components/Course/components/FormCards/CurriculumForm";
import LearningObjectivesForm from "@/app/_components/Course/components/FormCards/ObjectivesForm";
import PricesForm from "@/app/_components/Course/components/FormCards/PricesForm";
import RequirementsForm from "@/app/_components/Course/components/FormCards/RequirementsForm";
import StatsCourse from "@/app/_components/Course/components/FormCards/StatsCourse";
import StatusCourse from "@/app/_components/Course/components/FormCards/StatusCourse";
import Tips from "@/app/_components/Course/components/FormCards/Tips";
import PreviewButton from "@/app/_components/Course/components/PreviewButton";
import UpdateCourseActions from "@/app/_components/Course/components/UpdateCourseActions";
import { STATUS_COURSE_LIST } from "@/lib/constants/statusCourse";

const CourseBuilder = ({ course, mode }: CourseBuilderProps) => {
	const isEdit = mode === "edit";

	return (
		<CourseFormProvider course={course}>
			<CourseFormLayout>
				<CourseFormHeader
					description={
						isEdit
							? "Update your course details"
							: "Fill in the details to create your course"
					}
					title={isEdit ? "Edit Course" : "Create New Course"}
				>
					{isEdit ? (
						<PreviewButton courseId={course?.id} />
					) : (
						<CreateCourseActions />
					)}
				</CourseFormHeader>

				{isEdit && <EditBanner title={course?.title} />}

				<ColumnsLayout>
					<ColumnLayout className="lg:col-span-2">
						<BasicInformationForm isEdit={isEdit} />

						{isEdit ? (
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
						) : (
							<CourseMediaForm />
						)}

						<LearningObjectivesForm isEdit={isEdit} />
						<RequirementsForm />
						<CurriculumForm courseId={course?.id} isEdit={isEdit} />
					</ColumnLayout>

					<ColumnLayout>
						<PricesForm />
						<StatusCourse status={course?.status ?? STATUS_COURSE_LIST.DRAFT} />

						{isEdit ? (
							<>
								<StatsCourse />
								<UpdateCourseActions />
							</>
						) : (
							<Tips />
						)}
					</ColumnLayout>
				</ColumnsLayout>
			</CourseFormLayout>
		</CourseFormProvider>
	);
};

export default CourseBuilder;
