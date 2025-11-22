"use client";

import { FormProvider } from "react-hook-form";
import type { CourseFormProviderType } from "@/app/_components/Course/components/CourseFormProvider/types";
import { useCourseForm } from "@/app/_components/Course/hooks/useCourseForm";

const CourseFormProvider = ({ course, children }: CourseFormProviderType) => {
	const methods = useCourseForm(course);

	return <FormProvider {...methods}>{children}</FormProvider>;
};

export default CourseFormProvider;
