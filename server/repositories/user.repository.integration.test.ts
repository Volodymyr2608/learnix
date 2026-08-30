import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import {
	makeConceptMastery,
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
import { NOT_ANONYMISED, userRepository } from "./user.repository";

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
		// Random, not derived from the user id — a derived address would be a
		// pre-image an attacker could squat to block deletion permanently.
		expect(after.email).toMatch(
			/^deleted-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@system\.invalid$/,
		);
		expect(after.email).not.toContain(user.id);
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
		await testDb.conceptCheck.create({
			data: {
				studentId: user.id,
				lessonId: lesson.id,
				courseId: course.id,
				concept: "Recursion",
				conceptKey: "recursion",
				question: "Which call ends a recursive descent?",
				questionKey: "which call ends a recursive descent?",
				options: ["The base case", "A recursive call"],
				correct: "The base case",
				expiresAt: new Date(Date.now() + 60_000),
			},
		});
		await testDb.$executeRaw`
			INSERT INTO user_interest_embeddings ("userId", embedding, "updatedAt")
			VALUES (${user.id}, ${`[${Array(1536).fill(0).join(",")}]`}::vector, NOW())
		`;
		// The two archive tables the mastery migrations wrote. They hold this
		// student's educational record, carry no foreign key, and are invisible to
		// the schema — so nothing cascades and nothing else names them.
		await testDb.$executeRaw`
			INSERT INTO "concept_mastery_archive_merge" ("id", "studentId", "courseId", concept, level, "updatedAt")
			VALUES ('archived-merge', ${user.id}, ${course.id}, 'Recursion', 2, NOW())
		`;
		await testDb.$executeRaw`
			INSERT INTO "concept_mastery_archive_le2" ("id", "studentId", "courseId", concept, level, "conceptKey", "updatedAt")
			VALUES ('archived-le2', ${user.id}, ${course.id}, 'Recursion', 1, 'recursion', NOW())
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
		// A model-authored question about this student, and its answer key. The
		// explicit delete is the control — the FK cascade never fires here, because
		// ADR-025 keeps the User row.
		expect(
			await testDb.conceptCheck.count({ where: { studentId: user.id } }),
		).toBe(0);
		// Erasure has to reach the archives too, or anonymisation leaves the
		// student's mastery history sitting in two tables nothing else knows about.
		for (const table of [
			"concept_mastery_archive_merge",
			"concept_mastery_archive_le2",
		]) {
			const rows = await testDb.$queryRawUnsafe<{ count: bigint }[]>(
				`SELECT count(*) AS count FROM "${table}" WHERE "studentId" = $1`,
				user.id,
			);
			expect(Number(rows[0]?.count)).toBe(0);
		}
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
		const taken = "deleted-collision@system.invalid";
		await makeUser({ email: taken });

		await expect(
			userRepository.anonymiseAccount(user.id, taken),
		).rejects.toThrow();

		const after = await testDb.user.findUniqueOrThrow({
			where: { id: user.id },
		});
		expect(after.name).toBe("Ada Lovelace");
		expect(await testDb.session.count({ where: { userId: user.id } })).toBe(1);
	});

	it("cannot be blocked by someone squatting a predictable placeholder address", async () => {
		const user = await makeUser({ name: "Ada Lovelace" });

		// A counterparty can read this user's raw id from Message.senderId, so the
		// old derived address was guessable. Registering it must not be able to
		// deny the victim their deletion.
		await makeUser({ email: `deleted-${user.id}@system.invalid` });

		await expect(
			userRepository.anonymiseAccount(user.id),
		).resolves.toBeUndefined();

		const after = await testDb.user.findUniqueOrThrow({
			where: { id: user.id },
		});
		expect(after.name).toBe("Deleted user");
		expect(after.email).not.toBe(`deleted-${user.id}@system.invalid`);
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

describe("anonymisation leaves other people's data intact", () => {
	it("keeps the course, its curriculum and the student's progress when the instructor leaves", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		const enrollment = await makeEnrollment({
			studentId: student.id,
			courseId: course.id,
		});
		await testDb.courseProgress.create({
			data: { studentId: student.id, courseId: course.id, totalLessons: 1 },
		});
		await makeConceptMastery({
			studentId: student.id,
			courseId: course.id,
			concept: "Recursion",
		});

		await userRepository.anonymiseAccount(instructor.id);

		expect(
			await testDb.course.findUnique({ where: { id: course.id } }),
		).not.toBeNull();
		expect(
			await testDb.section.findUnique({ where: { id: section.id } }),
		).not.toBeNull();
		expect(
			await testDb.lesson.findUnique({ where: { id: lesson.id } }),
		).not.toBeNull();
		expect(
			await testDb.enrollment.findUnique({ where: { id: enrollment.id } }),
		).not.toBeNull();
		expect(
			await testDb.courseProgress.count({ where: { studentId: student.id } }),
		).toBe(1);
		expect(
			await testDb.conceptMastery.count({ where: { studentId: student.id } }),
		).toBe(1);
	});

	it("leaves the course still published and readable", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await userRepository.anonymiseAccount(instructor.id);

		const after = await testDb.course.findUniqueOrThrow({
			where: { id: course.id },
			include: { instructor: true },
		});
		expect(after.status).toBe("published");
		expect(after.deletedAt).toBeNull();
		expect(after.instructor.name).toBe("Deleted user");
	});

	it("preserves every payment field, including money in flight", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			transferStatus: "pending",
			stripePaymentIntentId: "pi_test_123",
			stripeTransferId: null,
		});

		await userRepository.anonymiseAccount(student.id);

		const after = await testDb.payment.findUniqueOrThrow({
			where: { id: payment.id },
		});
		expect(after.amountCents).toBe(payment.amountCents);
		expect(after.transferStatus).toBe("pending");
		expect(after.stripePaymentIntentId).toBe("pi_test_123");
		expect(after.stripeTransferId).toBeNull();
	});

	it("leaves a pending transfer visible to the sweep", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			transferStatus: "pending",
		});

		await userRepository.anonymiseAccount(student.id);

		// The exact query the sweep runs — server/api/routers/payment.ts:135-138.
		const pending = await testDb.payment.findMany({
			where: { transferStatus: "pending" },
			select: { instructorId: true },
		});
		expect(pending.map((p) => p.instructorId)).toContain(instructor.id);
	});

	it("leaves both sides of a conversation readable by the remaining party", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
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
		await makeMessage({
			conversationId: conversation.id,
			senderId: instructor.id,
			body: "Happy to help.",
		});

		await userRepository.anonymiseAccount(student.id);

		const thread = await testDb.conversation.findUniqueOrThrow({
			where: { id: conversation.id },
			include: { messages: true },
		});
		expect(thread.messages).toHaveLength(2);
		expect(thread.messages.map((m) => m.body)).toContain("Happy to help.");
	});

	it("does not move the course rating when a reviewer leaves", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const a = await makeUser();
		const b = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		await makeCourseReview({ courseId: course.id, studentId: a.id, rating: 5 });
		await makeCourseReview({ courseId: course.id, studentId: b.id, rating: 3 });

		const before = await testDb.courseReview.aggregate({
			where: { courseId: course.id },
			_avg: { rating: true },
			_count: true,
		});

		await userRepository.anonymiseAccount(a.id);

		const after = await testDb.courseReview.aggregate({
			where: { courseId: course.id },
			_avg: { rating: true },
			_count: true,
		});
		expect(after._avg.rating).toBe(before._avg.rating);
		expect(after._count).toBe(before._count);
	});

	it("keeps a completed enrollment renderable as a certificate", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const enrollment = await makeEnrollment({
			studentId: student.id,
			courseId: course.id,
			status: "completed",
			completedAt: new Date(),
		});

		await userRepository.anonymiseAccount(instructor.id);

		// certificate.service.ts:12-13 derives the PDF from exactly this shape.
		const found = await testDb.enrollment.findUniqueOrThrow({
			where: { id: enrollment.id },
			include: { course: true, student: true },
		});
		expect(found.status).toBe("completed");
		expect(found.course.title).toBe(course.title);
		// The instructor left, not the student: the certificate still names its holder.
		expect(found.student.name).toBe(student.name);
	});

	it("still renders a certificate for a student who deleted their own account", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const enrollment = await makeEnrollment({
			studentId: student.id,
			courseId: course.id,
			status: "completed",
			completedAt: new Date(),
		});

		await userRepository.anonymiseAccount(student.id);

		const found = await testDb.enrollment.findUniqueOrThrow({
			where: { id: enrollment.id },
			include: { course: true, student: true },
		});
		expect(found.status).toBe("completed");
		expect(found.completedAt).not.toBeNull();
		expect(found.course.title).toBe(course.title);
		expect(found.student.name).toBe("Deleted user");
	});
});

describe("NOT_ANONYMISED", () => {
	it("excludes anonymised accounts from the reindex population", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const staying = await makeUser();
		const leaving = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		await makeEnrollment({ studentId: staying.id, courseId: course.id });
		await makeEnrollment({ studentId: leaving.id, courseId: course.id });

		await userRepository.anonymiseAccount(leaving.id);

		// The exact query scripts/reindex-embeddings.ts runs. Without the filter the
		// anonymised account still matches — it keeps its enrollment — and the next
		// reindex would rebuild the interest embedding the deletion destroyed.
		const ids = (
			await testDb.user.findMany({
				where: { enrollments: { some: {} }, ...NOT_ANONYMISED },
				select: { id: true },
			})
		).map((u) => u.id);

		expect(ids).toContain(staying.id);
		expect(ids).not.toContain(leaving.id);
	});
});
