import type { CourseAdapted } from "@/lib/adapters/course/courseAdapter";
import type { OwnCourseStats } from "@/server/entities/course/stats";

export type CourseBuilderProps = {
	mode: "create" | "edit";
	course?: CourseAdapted;
	stats?: OwnCourseStats | null;
};
