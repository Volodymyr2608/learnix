export type ReadinessInput = {
	thumbnailUrl: string | null;
	objectives: string[];
	description: string;
	priceCents: number;
	sections: { lessons: unknown[] }[];
};

export type ReadinessItem = { id: string; label: string; met: boolean };
export type Readiness = { ready: boolean; items: ReadinessItem[] };

export function getPublishReadiness(course: ReadinessInput): Readiness {
	const lessonCount = course.sections.reduce((n, s) => n + s.lessons.length, 0);
	const items: ReadinessItem[] = [
		{
			id: "thumbnail",
			label: "Add a course thumbnail",
			met: !!course.thumbnailUrl,
		},
		{
			id: "objectives",
			label: "Add at least one learning objective",
			met: course.objectives.length > 0,
		},
		{ id: "lessons", label: "Add at least one lesson", met: lessonCount > 0 },
		{
			id: "description",
			label: "Write a course description",
			met: course.description.trim().length > 0,
		},
		{
			id: "price",
			label: "Set a price (free is allowed)",
			met: course.priceCents >= 0,
		},
	];
	return { ready: items.every((i) => i.met), items };
}
