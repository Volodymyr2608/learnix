import type { CourseAdapted } from "@/lib/adapters/course/courseAdapter";

export type CourseFormProviderType = {
	children: React.ReactNode;
	course?: CourseAdapted;
};
