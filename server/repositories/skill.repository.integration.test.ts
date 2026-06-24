import { afterEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import { skillRepository } from "./skill.repository";

describe("SkillRepository.listAll", () => {
	afterEach(async () => {
		await truncateAll();
	});

	it("returns all skills ordered by name ascending", async () => {
		await testDb.skill.create({
			data: { name: "Zebra Skill", slug: "zebra-skill" },
		});
		await testDb.skill.create({
			data: { name: "Alpha Skill", slug: "alpha-skill" },
		});

		const skills = await skillRepository.listAll();

		expect(skills.map((skill) => skill.name)).toEqual([
			"Alpha Skill",
			"Zebra Skill",
		]);
	});
});
