import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ConceptCheckStatus,
	EnrollmentStatus,
	MasteryEvidence,
} from "@/generated/prisma";
import { conceptMasteryRepository } from "@/server/repositories/conceptMastery.repository";
import { conceptKey } from "@/server/services/_shared/concepts/conceptKey";
import {
	CheckAlreadyPendingError,
	CheckBudgetSpentError,
	CheckUnavailableError,
	ConceptCheckForbiddenError,
} from "@/server/services/conceptCheck/conceptCheck.errors";
import {
	conceptCheckService,
	MAX_CHECKS_PER_LESSON,
} from "@/server/services/conceptCheck/conceptCheck.service";
import { CONVERSATION_MAX_LEVEL } from "@/server/services/mastery/masteryLevels";
import { testDb, truncateAll } from "@/test/db";
import {
	makeConceptMastery,
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const CONCEPT = "API Routes";
const HOUR = 60 * 60 * 1000;

const authored = {
	concept: CONCEPT,
	question: "Which file exports a route handler?",
	options: ["route.ts", "page.tsx", "layout.tsx", "loading.tsx"],
	correctOption: "route.ts",
};

type Seed = {
	studentId: string;
	courseId: string;
	lessonId: string;
	otherLessonId: string;
};

const seed = async ({ enrolled = true } = {}): Promise<Seed> => {
	const instructor = await makeUser();
	const student = await makeUser();
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({ sectionId: section.id });
	const otherLesson = await makeLesson({ sectionId: section.id, order: 1 });

	if (enrolled) {
		await makeEnrollment({ studentId: student.id, courseId: course.id });
	}

	return {
		studentId: student.id,
		courseId: course.id,
		lessonId: lesson.id,
		otherLessonId: otherLesson.id,
	};
};

const issue = (s: Seed, overrides: Partial<typeof authored> = {}) =>
	conceptCheckService.issue({
		studentId: s.studentId,
		lessonId: s.lessonId,
		...authored,
		...overrides,
	});

/** A closed check in the past, as the budget and the cooldown will read it. */
const answeredCheck = (
	s: Seed,
	{
		isCorrect,
		hoursAgo,
		concept = CONCEPT,
	}: { isCorrect: boolean; hoursAgo: number; concept?: string },
) =>
	testDb.conceptCheck.create({
		data: {
			studentId: s.studentId,
			lessonId: s.lessonId,
			courseId: s.courseId,
			concept,
			conceptKey: conceptKey(concept),
			question: authored.question,
			options: authored.options,
			correct: authored.correctOption,
			status: ConceptCheckStatus.ANSWERED,
			selectedAnswer: isCorrect ? "route.ts" : "page.tsx",
			isCorrect,
			expiresAt: new Date(Date.now() - hoursAgo * HOUR + 30 * 60 * 1000),
			answeredAt: new Date(Date.now() - hoursAgo * HOUR),
		},
	});

describe("conceptCheckService.issue", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	it("persists a check the student can answer, without handing back the key", async () => {
		const s = await seed();

		const issued = await issue(s);

		expect(issued).toMatchObject({
			lessonId: s.lessonId,
			concept: CONCEPT,
			question: authored.question,
		});
		expect(Object.keys(issued)).not.toContain("correct");

		const stored = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: issued.id },
		});
		expect(stored.status).toBe(ConceptCheckStatus.PENDING);
		expect(stored.correct).toBe("route.ts");
		expect(stored.conceptKey).toBe(conceptKey(CONCEPT));
		expect(stored.courseId).toBe(s.courseId);
		expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
		expect([...stored.options].sort()).toEqual([...authored.options].sort());
	});

	/**
	 * The cheapest control in the feature: "always make the correct option A"
	 * becomes a no-op, whether it arrives by injection through lesson content or
	 * as the model's own positional bias. Asserted at the write rather than at the
	 * tool, because the write is where a second caller could otherwise skip it.
	 *
	 * Twelve issues of a four-option question: if the stored order were the
	 * authored order, every one of them would place the key first. The chance of
	 * that happening under a real shuffle is 4^-12.
	 */
	it("stores an order drawn from the server's randomness, not the authored one", async () => {
		const positions = new Set<number>();

		for (let i = 0; i < 12; i++) {
			const s = await seed();
			const issued = await issue(s);
			positions.add(issued.options.indexOf(authored.correctOption));
		}

		expect(positions.has(-1)).toBe(false);
		expect(positions.size).toBeGreaterThan(1);
	});

	it("creates nothing for a lesson the student is not enrolled in", async () => {
		const s = await seed({ enrolled: false });

		await expect(issue(s)).rejects.toBeInstanceOf(ConceptCheckForbiddenError);
		await expect(testDb.conceptCheck.count()).resolves.toBe(0);
	});

	it("creates nothing once the enrollment is cancelled", async () => {
		const s = await seed();
		await testDb.enrollment.updateMany({
			where: { studentId: s.studentId, courseId: s.courseId },
			data: { status: EnrollmentStatus.cancelled },
		});

		await expect(issue(s)).rejects.toBeInstanceOf(ConceptCheckForbiddenError);
		await expect(testDb.conceptCheck.count()).resolves.toBe(0);
	});

	it("refuses a second check while one is open on the lesson", async () => {
		const s = await seed();
		await issue(s);

		await expect(
			issue(s, { concept: "Server Components" }),
		).rejects.toBeInstanceOf(CheckAlreadyPendingError);
		await expect(testDb.conceptCheck.count()).resolves.toBe(1);
	});

	it("sweeps an abandoned check so it cannot hold the lesson's slot forever", async () => {
		const s = await seed();
		const stale = await issue(s);
		await testDb.conceptCheck.update({
			where: { id: stale.id },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});

		const fresh = await issue(s);

		expect(fresh.id).not.toBe(stale.id);
		const sweptRow = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: stale.id },
		});
		expect(sweptRow.status).toBe(ConceptCheckStatus.EXPIRED);
		expect(sweptRow.answeredAt).toBeNull();
	});

	it("refuses a fourth check on the same concept", async () => {
		const s = await seed();
		for (const hoursAgo of [72, 60, 48]) {
			await answeredCheck(s, { isCorrect: false, hoursAgo });
		}

		await expect(issue(s)).rejects.toBeInstanceOf(CheckBudgetSpentError);
		await expect(
			testDb.conceptCheck.count({ where: { status: "PENDING" } }),
		).resolves.toBe(0);
	});

	it("counts the budget per concept, not per student", async () => {
		const s = await seed();
		for (const hoursAgo of [72, 60, 48]) {
			await answeredCheck(s, { isCorrect: false, hoursAgo });
		}

		await expect(
			issue(s, { concept: "Server Components" }),
		).resolves.toBeTruthy();
	});

	it("refuses a retry 19 hours after a wrong answer", async () => {
		const s = await seed();
		await answeredCheck(s, { isCorrect: false, hoursAgo: 19 });

		await expect(issue(s)).rejects.toBeInstanceOf(CheckBudgetSpentError);
	});

	it("allows a retry 25 hours after a wrong answer", async () => {
		const s = await seed();
		await answeredCheck(s, { isCorrect: false, hoursAgo: 25 });

		await expect(issue(s)).resolves.toBeTruthy();
	});

	/**
	 * A per-lesson ceiling that holds independently of the per-concept one.
	 * `lessonInsights.concepts` is LLM-generated with a loose upper bound, so
	 * 40 concepts x 3 checks is 120 authored questions per student per lesson —
	 * a cost ceiling nobody set, reachable without breaking any per-concept rule.
	 */
	it("refuses once the lesson's own ceiling is spent, whatever the concept", async () => {
		const s = await seed();
		for (let i = 0; i < MAX_CHECKS_PER_LESSON; i++) {
			await answeredCheck(s, {
				isCorrect: false,
				hoursAgo: 48 + i,
				concept: `Concept ${i}`,
			});
		}

		await expect(
			issue(s, { concept: "A brand new concept" }),
		).rejects.toBeInstanceOf(CheckBudgetSpentError);
	});

	it("counts the lesson ceiling per lesson, not per student", async () => {
		const s = await seed();
		for (let i = 0; i < MAX_CHECKS_PER_LESSON; i++) {
			await answeredCheck(s, {
				isCorrect: false,
				hoursAgo: 48 + i,
				concept: `Concept ${i}`,
			});
		}

		await expect(
			conceptCheckService.issue({
				studentId: s.studentId,
				lessonId: s.otherLessonId,
				...authored,
				concept: "A brand new concept",
			}),
		).resolves.toBeTruthy();
	});

	it("refuses a concept the student has already earned evidence for", async () => {
		const s = await seed();
		await makeConceptMastery({
			studentId: s.studentId,
			courseId: s.courseId,
			concept: "api  routes",
			level: CONVERSATION_MAX_LEVEL,
		});

		await expect(issue(s)).rejects.toBeInstanceOf(CheckBudgetSpentError);
	});

	it("still issues when the student holds no evidence for the concept", async () => {
		const s = await seed();
		// Nothing seeded on purpose: "below the ceiling" is no longer a row. Levels
		// 0 and 1 recorded exposure and are unrepresentable since the evidence
		// migration, so the absence of a row IS the below-the-ceiling state.
		await makeConceptMastery({
			studentId: s.studentId,
			courseId: s.courseId,
			concept: "Server Components",
			level: CONVERSATION_MAX_LEVEL,
		});

		await expect(issue(s)).resolves.toBeTruthy();
	});
});

describe("conceptCheckService.answer — four causes, one error", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	/**
	 * Absent, foreign, already-answered and expired. A caller able to tell them
	 * apart can walk `checkId`s and learn which ones exist and whose they are, so
	 * the four are required to be indistinguishable — not merely similar.
	 */
	const causes: [string, (s: Seed) => Promise<string>][] = [
		["absent", async () => "no-such-check"],
		[
			"belonging to another student",
			async (s) => {
				const intruder = await makeUser();
				await makeEnrollment({
					studentId: intruder.id,
					courseId: s.courseId,
				});
				const check = await issue(s);
				// The intruder submits the victim's id, through their own session.
				s.studentId = intruder.id;
				return check.id;
			},
		],
		[
			"already answered",
			async (s) => {
				const check = await issue(s);
				await testDb.conceptCheck.update({
					where: { id: check.id },
					data: {
						status: ConceptCheckStatus.ANSWERED,
						answeredAt: new Date(),
					},
				});
				return check.id;
			},
		],
		[
			"expired",
			async (s) => {
				const check = await issue(s);
				await testDb.conceptCheck.update({
					where: { id: check.id },
					data: { expiresAt: new Date(Date.now() - 1000) },
				});
				return check.id;
			},
		],
	];

	const failureFor = async (
		make: (s: Seed) => Promise<string>,
	): Promise<{ name: string; code: string; message: string }> => {
		await truncateAll();
		const s = await seed();
		const checkId = await make(s);

		try {
			await conceptCheckService.answer({
				studentId: s.studentId,
				checkId,
				optionIndex: 0,
			});
		} catch (error) {
			const e = error as CheckUnavailableError;
			return { name: e.name, code: e.code, message: e.message };
		}

		throw new Error("answer() resolved where it should have refused");
	};

	it.each(causes)("refuses a check that is %s", async (_label, make) => {
		const s = await seed();
		const checkId = await make(s);

		await expect(
			conceptCheckService.answer({
				studentId: s.studentId,
				checkId,
				optionIndex: 0,
			}),
		).rejects.toBeInstanceOf(CheckUnavailableError);
	});

	it("gives byte-identical failures for all four causes", async () => {
		const failures = [];
		for (const [, make] of causes) {
			failures.push(await failureFor(make));
		}

		const [first] = failures;
		expect(first).toBeDefined();
		for (const failure of failures) {
			expect(failure).toEqual(first);
		}
		// A message naming the cause is the oracle this test exists to prevent.
		expect(first?.message).not.toMatch(/expired|another|already|found/i);
	});

	it("leaves a foreign check untouched", async () => {
		const s = await seed();
		const check = await issue(s);
		const intruder = await makeUser();

		await expect(
			conceptCheckService.answer({
				studentId: intruder.id,
				checkId: check.id,
				optionIndex: 0,
			}),
		).rejects.toBeInstanceOf(CheckUnavailableError);

		const after = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: check.id },
		});
		expect(after.status).toBe(ConceptCheckStatus.PENDING);
		expect(after.answeredAt).toBeNull();
	});
});

describe("conceptCheckService.answer — grading and the write", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	afterAll(async () => {
		await testDb.$disconnect();
		vi.restoreAllMocks();
	});

	/** The index of the correct option in the order the SERVER stored. */
	const correctIndex = (options: string[]) =>
		options.indexOf(authored.correctOption);

	it("writes exactly one row at the conversation ceiling for a correct answer", async () => {
		const s = await seed();
		const check = await issue(s);

		const result = await conceptCheckService.answer({
			studentId: s.studentId,
			checkId: check.id,
			optionIndex: correctIndex(check.options),
		});

		expect(result.isCorrect).toBe(true);

		const rows = await testDb.conceptMastery.findMany({
			where: { studentId: s.studentId },
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			level: CONVERSATION_MAX_LEVEL,
			concept: CONCEPT,
			conceptKey: conceptKey(CONCEPT),
			evidence: MasteryEvidence.APPLIED_CHECK,
			courseId: s.courseId,
		});
	});

	it("writes nothing for a wrong answer, and burns the check", async () => {
		const s = await seed();
		const check = await issue(s);
		const wrongIndex = check.options.findIndex(
			(option) => option !== authored.correctOption,
		);

		const result = await conceptCheckService.answer({
			studentId: s.studentId,
			checkId: check.id,
			optionIndex: wrongIndex,
		});

		expect(result.isCorrect).toBe(false);
		await expect(testDb.conceptMastery.count()).resolves.toBe(0);

		const stored = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: check.id },
		});
		expect(stored.status).toBe(ConceptCheckStatus.ANSWERED);
		expect(stored.isCorrect).toBe(false);
		expect(stored.selectedAnswer).toBe(check.options[wrongIndex]);
		expect(stored.answeredAt).not.toBeNull();
	});

	it("records which option was chosen on a correct answer too", async () => {
		const s = await seed();
		const check = await issue(s);

		await conceptCheckService.answer({
			studentId: s.studentId,
			checkId: check.id,
			optionIndex: correctIndex(check.options),
		});

		const stored = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: check.id },
		});
		expect(stored.selectedAnswer).toBe(authored.correctOption);
		expect(stored.isCorrect).toBe(true);
	});

	/**
	 * The reason claim and write share a transaction. Without it a crash after
	 * the claim consumes the check, burns one of the student's three, and leaves
	 * no mastery row — the student pays and gets nothing, with no way to retry.
	 */
	it("leaves the check answerable when the mastery write fails", async () => {
		const s = await seed();
		const check = await issue(s);

		const spy = vi
			.spyOn(conceptMasteryRepository, "upsertMastery")
			.mockRejectedValueOnce(new Error("write failed"));

		await expect(
			conceptCheckService.answer({
				studentId: s.studentId,
				checkId: check.id,
				optionIndex: correctIndex(check.options),
			}),
		).rejects.toThrow();
		spy.mockRestore();

		const stored = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: check.id },
		});
		expect(stored.status).toBe(ConceptCheckStatus.PENDING);
		expect(stored.answeredAt).toBeNull();
		await expect(testDb.conceptMastery.count()).resolves.toBe(0);
	});

	it("cannot grade once the enrollment is cancelled", async () => {
		const s = await seed();
		const check = await issue(s);
		await testDb.enrollment.updateMany({
			where: { studentId: s.studentId, courseId: s.courseId },
			data: { status: EnrollmentStatus.cancelled },
		});

		await expect(
			conceptCheckService.answer({
				studentId: s.studentId,
				checkId: check.id,
				optionIndex: correctIndex(check.options),
			}),
		).rejects.toBeInstanceOf(CheckUnavailableError);

		const stored = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: check.id },
		});
		expect(stored.status).toBe(ConceptCheckStatus.PENDING);
		await expect(testDb.conceptMastery.count()).resolves.toBe(0);
	});

	it("compares expiry against the database clock", async () => {
		const s = await seed();
		const check = await issue(s);
		// Expired according to Postgres regardless of what the app believes the
		// time is — the claim reads NOW(), not `new Date()`.
		await testDb.$executeRaw`
			UPDATE concept_checks SET "expiresAt" = NOW() - INTERVAL '1 second'
			WHERE id = ${check.id}
		`;

		await expect(
			conceptCheckService.answer({
				studentId: s.studentId,
				checkId: check.id,
				optionIndex: correctIndex(check.options),
			}),
		).rejects.toBeInstanceOf(CheckUnavailableError);
	});

	it("refuses an option position the question never offered", async () => {
		const s = await seed();
		const check = await issue(s);

		const result = await conceptCheckService.answer({
			studentId: s.studentId,
			checkId: check.id,
			optionIndex: 99,
		});

		expect(result.isCorrect).toBe(false);
		await expect(testDb.conceptMastery.count()).resolves.toBe(0);
	});

	it("produces exactly one success and one mastery row when two answers race", async () => {
		const s = await seed();
		const check = await issue(s);
		const index = correctIndex(check.options);

		const results = await Promise.allSettled([
			conceptCheckService.answer({
				studentId: s.studentId,
				checkId: check.id,
				optionIndex: index,
			}),
			conceptCheckService.answer({
				studentId: s.studentId,
				checkId: check.id,
				optionIndex: index,
			}),
		]);

		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const loser = results.find((r) => r.status === "rejected");
		expect((loser as PromiseRejectedResult).reason).toBeInstanceOf(
			CheckUnavailableError,
		);
		await expect(testDb.conceptMastery.count()).resolves.toBe(1);
	});
});
