import type {
	SkillProgressRow,
	SkillProgressView,
} from "@/server/entities/student/skillProgress";

export function toSkillProgressViews(
	rows: SkillProgressRow[],
): SkillProgressView[] {
	return rows
		.map((row) => ({
			skillId: row.skillId,
			skill: row.name,
			level:
				row.enrolled > 0 ? Math.round((row.completed / row.enrolled) * 100) : 0,
			completed: row.completed,
		}))
		.sort((a, b) => b.level - a.level || a.skill.localeCompare(b.skill));
}
