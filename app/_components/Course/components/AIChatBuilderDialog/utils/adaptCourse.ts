import type { CourseData } from "@/app/_components/Course/components/AIChatBuilderDialog/types";

export function adaptCourse(course: CourseData) {
	const durationNumber = Number.parseFloat(course.duration);

	return {
		...course,
		category: course.category.toLowerCase(),
		language: course.language.toLowerCase(),
		level: course.level.toLowerCase(),
		duration: (Number.isFinite(durationNumber) ? durationNumber : 0).toString(),
	};
}
