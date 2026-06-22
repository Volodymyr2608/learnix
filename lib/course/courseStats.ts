export type LessonStat = {
	durationMinutes: number | null;
	videoUrl: string | null;
	resources: unknown;
};

export type SectionStat = { lessons: LessonStat[] };

const allLessons = (sections: SectionStat[]): LessonStat[] =>
	sections.flatMap((s) => s.lessons);

export function sumTotalDurationMinutes(sections: SectionStat[]): number {
	return allLessons(sections).reduce(
		(sum, l) => sum + (l.durationMinutes ?? 0),
		0,
	);
}

export function sumVideoDurationMinutes(sections: SectionStat[]): number {
	return allLessons(sections)
		.filter((l) => !!l.videoUrl && l.videoUrl.trim() !== "")
		.reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0);
}

export function countLectures(sections: SectionStat[]): number {
	return allLessons(sections).length;
}

export function countResources(sections: SectionStat[]): number {
	return allLessons(sections).reduce(
		(sum, l) => sum + (Array.isArray(l.resources) ? l.resources.length : 0),
		0,
	);
}
