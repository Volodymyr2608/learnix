import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { testDb, truncateAll } from "@/test/db";
import {
	makeConceptCheck,
	makeConceptMastery,
	makeConversation,
	makeCourse,
	makeEnrollment,
	makeInstructorProfile,
	makeLearningPathCache,
	makeLesson,
	makeLessonAssistantConversation,
	makeLessonProgress,
	makeOpenedLesson,
	makePayment,
	makeQuiz,
	makeQuizAttempt,
	makeSection,
	makeUser,
} from "@/test/factories";

const stripeMock = vi.hoisted(() => ({
	piRetrieve: vi.fn(),
	refundsList: vi.fn(),
	refundsCreate: vi.fn(),
	transfersCreate: vi.fn(),
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		paymentIntents: { retrieve: stripeMock.piRetrieve },
		refunds: { list: stripeMock.refundsList, create: stripeMock.refundsCreate },
		events: { list: async () => ({ data: [], has_more: false }) },
		accounts: { retrieve: async () => ({ payouts_enabled: true }) },
		transfers: {
			list: async () => ({ data: [] }),
			create: stripeMock.transfersCreate,
			listReversals: async () => ({ data: [] }),
			createReversal: vi.fn(),
		},
	},
}));
vi.mock("@/server/services/payments/runLock", () => ({
	getRunLock: () => ({
		acquire: async () => "token",
		release: async () => undefined,
	}),
}));
const recompute = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: recompute },
}));
vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => true,
}));

const { refundService } = await import("./refund.service");
const { payoutJobService } = await import(
	"@/server/services/payments/payoutJob.service"
);
const { stripeEventService } = await import(
	"@/server/services/payments/stripeEvent.service"
);

const DAY = 24 * 60 * 60 * 1000;

describe("a self-service refund applies every effect once (AC-F2, AC-F14, FR-P14)", () => {
	let studentId: string;
	let courseId: string;
	let paymentId: string;

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		await makeInstructorProfile({
			userId: instructor.id,
			stripeAccountId: "acct_1",
			stripePayoutsEnabled: true,
		});
		studentId = (await makeUser()).id;
		courseId = (
			await makeCourse({ instructorId: instructor.id, status: "published" })
		).id;
		const section = await makeSection({ courseId });
		const lessons = await Promise.all(
			[1, 2, 3, 4, 5, 6].map((order) =>
				makeLesson({ sectionId: section.id, order, durationMinutes: 10 }),
			),
		);
		const first = lessons[0]?.id ?? "";
		await makeEnrollment({ studentId, courseId, progress: 17 });
		await makeOpenedLesson({ studentId, lessonId: first });
		await makeLessonProgress({
			lessonId: first,
			studentId,
			isCompleted: true,
			completedAt: new Date(),
		});
		const quiz = await makeQuiz({ lessonId: first });
		await makeQuizAttempt({ quizId: quiz.id, studentId });
		await makeLessonAssistantConversation({ lessonId: first, studentId });
		await makeConceptCheck({ studentId, lessonId: first, courseId });
		await makeLearningPathCache({ studentId, courseId });
		await makeConceptMastery({ studentId, courseId, concept: "Recursion" });
		await makeConversation({
			studentId,
			instructorId: instructor.id,
			courseId,
		});
		paymentId = (
			await makePayment({
				studentId,
				instructorId: instructor.id,
				courseId,
				amountCents: 4999,
				transferStatus: "pending",
				paidAt: new Date(Date.now() - 2 * DAY),
				stripePaymentIntentId: "pi_e2e",
			})
		).id;
		stripeMock.piRetrieve.mockResolvedValue({
			latest_charge: { id: "ch_e2e", disputed: false, refunded: false },
		});
		stripeMock.refundsList.mockResolvedValue({ data: [] });
		stripeMock.refundsCreate.mockResolvedValue({
			id: "re_e2e",
			status: "succeeded",
		});
	});

	it("refunds at once, applies every effect, and the late webhook and the job change nothing", async () => {
		const result = await refundService.requestRefund(studentId, {
			paymentId,
			reason: "too_hard",
		});

		expect(result).toMatchObject({
			decision: "auto_approved",
			refundStatus: "refunded",
		});
		expect(stripeMock.refundsCreate).toHaveBeenCalledTimes(1);

		const state = async () => ({
			payment: await testDb.payment.findUniqueOrThrow({
				where: { id: paymentId },
			}),
			enrollment: await testDb.enrollment.findFirstOrThrow({
				where: { studentId, courseId },
			}),
			progress: await testDb.lessonProgress.count({ where: { studentId } }),
			opened: await testDb.openedLesson.count({ where: { studentId } }),
			attempts: await testDb.quizAttempt.count({ where: { studentId } }),
			tutor: await testDb.lessonAssistantConversation.count({
				where: { studentId },
			}),
			checks: await testDb.conceptCheck.count({ where: { studentId } }),
			path: await testDb.learningPathCache.count({ where: { studentId } }),
			mastery: await testDb.conceptMastery.count({ where: { studentId } }),
			archive: await testDb.studyArchive.findMany({
				where: { studentId },
				orderBy: { day: "asc" },
			}),
			conversation: await testDb.conversation.findFirstOrThrow({
				where: { studentId },
			}),
		});
		const after = await state();
		expect(after.payment).toMatchObject({
			status: "refunded",
			transferStatus: "cancelled",
		});
		expect(after.enrollment).toMatchObject({
			status: "cancelled",
			progress: 0,
		});
		expect(after).toMatchObject({
			progress: 0,
			opened: 0,
			attempts: 0,
			tutor: 0,
			checks: 0,
			path: 0,
			mastery: 1,
		});
		expect(after.archive.find((a) => a.lessons > 0)).toMatchObject({
			minutes: 10,
			lessons: 1,
		});
		expect(after.conversation.closedAt).toBeInstanceOf(Date);
		expect(recompute).toHaveBeenCalledWith(studentId);
		expect(
			await enrollmentRepository.findAnyEnrollmentCourseIds(studentId),
		).toContain(courseId);

		const lateWebhook = {
			id: "evt_late",
			type: "charge.refunded",
			data: {
				object: {
					id: "ch_e2e",
					amount: 4999,
					amount_refunded: 4999,
					payment_intent: "pi_e2e",
				},
			},
		} as unknown as Stripe.Event;
		await stripeEventService.handle(lateWebhook, new Date());
		await payoutJobService.run({
			trigger: "cron",
			now: new Date(Date.now() + 20 * DAY),
		});

		expect(await state()).toEqual(after);
		expect(stripeMock.refundsCreate).toHaveBeenCalledTimes(1);
		expect(stripeMock.transfersCreate).not.toHaveBeenCalled();
	});
});
