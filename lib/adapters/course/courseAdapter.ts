import type { FullCourse } from "@/server/entities/course";

export type CourseAdapted = ReturnType<typeof courseAdapter>;

const courseAdapter = (course: FullCourse) => {
	const { objectives, requirements, sections, ...rest } = course;

	return {
		...rest,
		objectives: objectives.map((objective) => ({ value: objective })),
		requirements: requirements.map((requirement) => ({ value: requirement })),
		sections: sections.map((section) => ({
			id: section.id,
			title: section.title,
			order: section.order,
			lessons: section.lessons.map((lesson) => ({
				id: lesson.id,
				title: lesson.title,
				durationMinutes: lesson.durationMinutes,
			})),
		})),
	};
};

export default courseAdapter;
