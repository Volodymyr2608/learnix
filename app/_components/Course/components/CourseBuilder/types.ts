import type { CourseAdapted } from "@/lib/adapters/course/courseAdapter";

type EditCourse = {
	mode: "edit";
	course: CourseAdapted;
};

type CreateCourse = {
	mode: "create";
	course: undefined;
};

export type CourseBuilderProps = CreateCourse | EditCourse;
