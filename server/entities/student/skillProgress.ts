/** One row aggregated from enrollments × course_skills for a single student. */
export type SkillProgressRow = {
	skillId: string;
	name: string;
	enrolled: number;
	completed: number;
};

/** One skill's progress as rendered on the progress page. */
export type SkillProgressView = {
	skillId: string;
	skill: string;
	level: number; // 0-100, % of the student's skill-tagged courses completed
	completed: number; // count of completed courses with this skill
};
