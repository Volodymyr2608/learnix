import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { CourseAdapted } from "@/lib/adapters/course/courseAdapter";
import { courseSchema } from "@/server/entities/course";

export const getDefaultCourseValues = (course?: CourseAdapted) => ({
	title: course?.title ?? "",
	subtitle: course?.subtitle ?? "",
	description: course?.description ?? "",
	category: course?.category ?? "",
	level: course?.level ?? "",
	language: course?.language ?? "",
	duration: course?.duration ?? "",
	price: course?.price ?? "",
	originalPrice: course?.originalPrice ?? "",
	thumbnail: undefined,
	previewVideo: undefined,
	objectives: course?.objectives ?? [
		{ value: "" },
		{ value: "" },
		{ value: "" },
		{ value: "" },
	],
	requirements: course?.requirements ?? [{ value: "" }, { value: "" }],
	sections: course?.sections ?? [
		{ title: "", lessons: [{ title: "", duration: "" }] },
	],
});

export const useCourseForm = (course?: CourseAdapted) => {
	return useForm({
		resolver: zodResolver(courseSchema),
		defaultValues: getDefaultCourseValues(course),
	});
};
