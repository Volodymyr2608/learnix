import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import {
	makeConversation,
	makeCourse,
	makeCourseReview,
	makeEnrollment,
	makeInstructorProfile,
	makeLesson,
	makeMessage,
	makePayment,
	makeSection,
	makeUser,
} from "@/test/factories";
import { userRepository } from "./user.repository";

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

describe("User relations that must never cascade", () => {
	it("refuses to delete an instructor who has a course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id });

		await expect(
			testDb.user.delete({ where: { id: instructor.id } }),
		).rejects.toThrow();

		expect(
			await testDb.user.findUnique({ where: { id: instructor.id } }),
		).not.toBeNull();
	});

	it("refuses to delete a student who has a payment, enrollment or review", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		await makeCourseReview({ courseId: course.id, studentId: student.id });

		await expect(
			testDb.user.delete({ where: { id: student.id } }),
		).rejects.toThrow();
	});

	it("refuses to delete either party to a conversation", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({ instructorId: instructor.id });
		const conversation = await makeConversation({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		await makeMessage({
			conversationId: conversation.id,
			senderId: student.id,
		});

		await expect(
			testDb.user.delete({ where: { id: student.id } }),
		).rejects.toThrow();
		await expect(
			testDb.user.delete({ where: { id: instructor.id } }),
		).rejects.toThrow();
	});
});

describe("userRepository.anonymiseAccount", () => {
	it("overwrites the identifying fields and keeps the row", async () => {
		const user = await makeUser({
			name: "Ada Lovelace",
			image: "https://example.com/ada.png",
			emailVerified: true,
		});

		await userRepository.anonymiseAccount(user.id);

		const after = await testDb.user.findUniqueOrThrow({
			where: { id: user.id },
		});
		expect(after.name).toBe("Deleted user");
		expect(after.email).toBe(`deleted-${user.id}@system.invalid`);
		expect(after.image).toBeNull();
		expect(after.emailVerified).toBe(false);
		expect(after.emailNotificationsEnabled).toBe(false);
	});

	it("destroys credentials and private authored content", async () => {
		const user = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({ instructorId: user.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });

		await testDb.session.create({
			data: {
				userId: user.id,
				token: "sess-token",
				expiresAt: new Date(Date.now() + 60_000),
			},
		});
		await testDb.account.create({
			data: { userId: user.id, accountId: user.id, providerId: "credential" },
		});
		const conversation = await testDb.lessonAssistantConversation.create({
			data: { lessonId: lesson.id, studentId: user.id },
		});
		await testDb.lessonAssistantMessage.create({
			data: {
				conversationId: conversation.id,
				role: "user",
				content: "secret",
			},
		});
		const generation = await testDb.courseGeneration.create({
			data: { instructorId: user.id, content: {} },
		});
		await testDb.courseGenerationMessage.create({
			data: { generationId: generation.id, role: "user", content: "secret" },
		});
		await testDb.notificationLog.create({
			data: {
				userId: user.id,
				automation: "inactivity",
				dedupKey: `dedup-${user.id}`,
				payload: {},
			},
		});
		await testDb.learningPathCache.create({
			data: {
				studentId: user.id,
				courseId: course.id,
				steps: [],
				summary: "s",
				weakConcepts: [],
				model: "test",
			},
		});
		await testDb.$executeRaw`
			INSERT INTO user_interest_embeddings ("userId", embedding, "updatedAt")
			VALUES (${user.id}, ${`[${Array(1536).fill(0).join(",")}]`}::vector, NOW())
		`;

		await userRepository.anonymiseAccount(user.id);

		expect(await testDb.session.count({ where: { userId: user.id } })).toBe(0);
		expect(await testDb.account.count({ where: { userId: user.id } })).toBe(0);
		expect(
			await testDb.lessonAssistantConversation.count({
				where: { studentId: user.id },
			}),
		).toBe(0);
		expect(await testDb.lessonAssistantMessage.count()).toBe(0);
		expect(
			await testDb.courseGeneration.count({ where: { instructorId: user.id } }),
		).toBe(0);
		expect(await testDb.courseGenerationMessage.count()).toBe(0);
		expect(
			await testDb.notificationLog.count({ where: { userId: user.id } }),
		).toBe(0);
		expect(
			await testDb.learningPathCache.count({ where: { studentId: user.id } }),
		).toBe(0);

		const embeddings = await testDb.$queryRaw<{ count: bigint }[]>`
			SELECT count(*) FROM user_interest_embeddings WHERE "userId" = ${user.id}
		`;
		expect(Number(embeddings[0]?.count)).toBe(0);
	});

	it("rolls the whole operation back when any statement fails", async () => {
		const user = await makeUser({ name: "Ada Lovelace" });
		await testDb.session.create({
			data: {
				userId: user.id,
				token: "sess-token",
				expiresAt: new Date(Date.now() + 60_000),
			},
		});

		// Occupy the anonymised address so the final UPDATE violates users.email's
		// unique constraint — a real failure, after the deletes have already run.
		await makeUser({ email: `deleted-${user.id}@system.invalid` });

		await expect(userRepository.anonymiseAccount(user.id)).rejects.toThrow();

		const after = await testDb.user.findUniqueOrThrow({
			where: { id: user.id },
		});
		expect(after.name).toBe("Ada Lovelace");
		expect(await testDb.session.count({ where: { userId: user.id } })).toBe(1);
	});

	it("lets two accounts sharing a course, review and thread both be anonymised", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const a = await makeUser();
		const b = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		for (const student of [a, b]) {
			await makeCourseReview({ courseId: course.id, studentId: student.id });
			await testDb.courseProgress.create({
				data: { studentId: student.id, courseId: course.id, totalLessons: 3 },
			});
			await makeConversation({
				studentId: student.id,
				instructorId: instructor.id,
				courseId: course.id,
			});
		}

		await userRepository.anonymiseAccount(a.id);
		await userRepository.anonymiseAccount(b.id);

		const emails = await testDb.user.findMany({
			where: { id: { in: [a.id, b.id] } },
			select: { email: true },
		});
		expect(new Set(emails.map((e) => e.email)).size).toBe(2);
	});

	it("blanks the instructor's authored text but keeps the payout account", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeInstructorProfile({
			userId: instructor.id,
			professionalBio: "I have taught backend engineering since 2019.",
			courseIdea: "A course on distributed systems",
			teachingExperience: "5 years at a FAANG",
			areaOfExpertise: "Distributed systems",
			phone: "+380000000000",
			linkedinUrl: "https://linkedin.com/in/example",
			websiteUrl: "https://example.com",
			stripeAccountId: "acct_test_123",
			stripeChargesEnabled: true,
			stripePayoutsEnabled: true,
		});

		await userRepository.anonymiseAccount(instructor.id);

		const profile = await testDb.instructorProfile.findUniqueOrThrow({
			where: { userId: instructor.id },
		});

		// Authored self-description is gone.
		expect(profile.professionalBio).toBe("");
		expect(profile.courseIdea).toBe("");
		expect(profile.teachingExperience).toBe("");
		expect(profile.areaOfExpertise).toBe("");
		expect(profile.phone).toBeNull();
		expect(profile.linkedinUrl).toBeNull();
		expect(profile.websiteUrl).toBeNull();

		// The payout account survives, so money already owed can still be transferred.
		expect(profile.stripeAccountId).toBe("acct_test_123");
		expect(profile.stripePayoutsEnabled).toBe(true);
	});
});
