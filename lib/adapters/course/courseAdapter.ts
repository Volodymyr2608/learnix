import type { FullCourse } from "@/server/entities/course";

export type CourseAdapted = ReturnType<typeof courseAdapter>;

const courseAdapter = (course: FullCourse) => {
	const { objectives, requirements, sections, ...rest } = course;

	return {
		...rest,
		objectives: objectives.map((objective) => ({ value: objective })),
		requirements: requirements.map((requirement) => ({ value: requirement })),
		sections: sections.map((section) => ({
			title: section.title,
			lessons: section.lessons.map((lesson) => ({
				title: lesson.title,
				duration: lesson.duration,
			})),
		})),
	};
};

export default courseAdapter;
