import { describe, expect, it } from "vitest";
import type { SkillProgressRow } from "@/server/entities/student/skillProgress";
import { toSkillProgressViews } from "./skillProgress.rules";

describe("toSkillProgressViews", () => {
	it("returns an empty array for no rows", () => {
		expect(toSkillProgressViews([])).toEqual([]);
	});

	it("rounds the completion percentage", () => {
		const rows: SkillProgressRow[] = [
			{ skillId: "s1", name: "React", enrolled: 3, completed: 1 },
		];
		expect(toSkillProgressViews(rows)).toEqual([
			{ skillId: "s1", skill: "React", level: 33, completed: 1 },
		]);
	});

	it("sorts by level descending, then by skill name ascending", () => {
		const rows: SkillProgressRow[] = [
			{ skillId: "s1", name: "Zebra Skill", enrolled: 2, completed: 1 }, // 50%
			{ skillId: "s2", name: "Alpha Skill", enrolled: 2, completed: 1 }, // 50%
			{ skillId: "s3", name: "Python", enrolled: 1, completed: 1 }, // 100%
		];
		expect(toSkillProgressViews(rows).map((v) => v.skill)).toEqual([
			"Python",
			"Alpha Skill",
			"Zebra Skill",
		]);
	});
});
