"use client";

import { FormProvider } from "react-hook-form";
import { useCourseForm } from "@/app/_components/Course/hooks/useCourseForm";

const CourseFormProvider = ({ course, children }) => {
	const methods = useCourseForm(course);

	return <FormProvider {...methods}>{children}</FormProvider>;
};

export default CourseFormProvider;
