import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeUser } from "@/test/factories";

describe("CourseGeneration.instructorId foreign key", () => {
	it("rejects a generation whose instructor does not exist", async () => {
		await expect(
			testDb.courseGeneration.create({
				data: { instructorId: "no-such-user", content: {} },
			}),
		).rejects.toThrow();
	});

	it("accepts a generation for a real instructor", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });

		const generation = await testDb.courseGeneration.create({
			data: { instructorId: instructor.id, content: {} },
		});

		expect(generation.instructorId).toBe(instructor.id);
	});
});
