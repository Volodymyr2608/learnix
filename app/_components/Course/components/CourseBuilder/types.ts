import type { CourseAdapted } from "@/lib/adapters/course/courseAdapter";

export type CourseBuilderProps = {
	mode: "create" | "edit";
	course?: CourseAdapted;
};
