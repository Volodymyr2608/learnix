import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeUser } from "@/test/factories";
import { instructorRepository } from "./instructor.repository";

async function makeInstructorProfile(
	userId: string,
	reviewsLastViewedAt: Date | null = null,
) {
	return testDb.instructorProfile.create({
		data: {
			userId,
			areaOfExpertise: "x",
			teachingExperience: "x",
			professionalBio: "x",
			courseIdea: "x",
			reviewsLastViewedAt,
		},
	});
}

describe("InstructorRepository.getReviewsLastViewedAt", () => {
	it("returns the stored timestamp", async () => {
		const user = await makeUser({ role: Role.INSTRUCTOR });
		const when = new Date("2025-05-01T00:00:00.000Z");
		await makeInstructorProfile(user.id, when);

		expect(await instructorRepository.getReviewsLastViewedAt(user.id)).toEqual(
			when,
		);
	});

	it("returns null when never viewed", async () => {
		const user = await makeUser({ role: Role.INSTRUCTOR });
		await makeInstructorProfile(user.id, null);

		expect(
			await instructorRepository.getReviewsLastViewedAt(user.id),
		).toBeNull();
	});
});

describe("InstructorRepository.touchReviewsViewed", () => {
	it("stamps reviewsLastViewedAt to ~now", async () => {
		const user = await makeUser({ role: Role.INSTRUCTOR });
		await makeInstructorProfile(user.id, null);

		const before = Date.now();
		await instructorRepository.touchReviewsViewed(user.id);
		const after = await instructorRepository.getReviewsLastViewedAt(user.id);

		expect(after).not.toBeNull();
		expect((after as Date).getTime()).toBeGreaterThanOrEqual(before - 1000);
	});
});
