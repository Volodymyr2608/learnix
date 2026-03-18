"use client";

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
	console.log(course);
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

						<CourseMediaForm
							previewVideoUrl={course?.previewVideoUrl ?? null}
							thumbnailUrl={course?.thumbnailUrl ?? null}
						/>

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
								<UpdateCourseActions
									courseId={course?.id}
									previewVideoUrl={course?.previewVideoUrl ?? null}
									status={course?.status ?? STATUS_COURSE_LIST.DRAFT}
									thumbnailUrl={course?.thumbnailUrl ?? null}
								/>
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
