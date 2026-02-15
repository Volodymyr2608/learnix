import type { CourseSchemaOutput } from "@/server/entities/course";

export function adaptCourse(course: CourseSchemaOutput) {
	const durationNumber = Number.parseFloat(course.duration);

	return {
		...course,
		category: course.category.toLowerCase(),
		language: course.language.toLowerCase(),
		level: course.level.toLowerCase(),
		duration: (Number.isFinite(durationNumber) ? durationNumber : 0).toString(),
	};
}
