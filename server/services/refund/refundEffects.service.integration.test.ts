import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeConversation,
	makeCourse,
	makeCourseReview,
	makeEnrollment,
	makeLesson,
	makeLessonProgress,
	makePayment,
	makeRefundRequest,
	makeSection,
	makeUser,
} from "@/test/factories";

const stripeMock = vi.hoisted(() => ({
	listReversals: vi.fn(),
	createReversal: vi.fn(),
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		transfers: {
			listReversals: stripeMock.listReversals,
			createReversal: stripeMock.createReversal,
		},
	},
}));
const recompute = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: recompute },
}));

const { refundEffectsService } = await import("./refundEffects.service");

const NOW = new Date("2026-11-20T10:00:00.000Z");

describe("refundEffectsService.apply (FR-P6–P13, C8)", () => {
	let ids: { studentId: string; instructorId: string; courseId: string };
	let enrollmentId: string;

	const seedPayment = (overrides: Record<string, unknown> = {}) =>
		makePayment({ ...ids, transferStatus: "pending", ...overrides });

	const reload = async (paymentId: string) => ({
		payment: await testDb.payment.findUniqueOrThrow({
			where: { id: paymentId },
		}),
		enrollment: await testDb.enrollment.findUniqueOrThrow({
			where: { id: enrollmentId },
		}),
		conversation: await testDb.conversation.findFirstOrThrow({
			where: { studentId: ids.studentId },
		}),
		review: await testDb.courseReview.findFirstOrThrow({
			where: { studentId: ids.studentId },
		}),
		progress: await testDb.lessonProgress.count({
			where: { studentId: ids.studentId },
		}),
		archive: await testDb.studyArchive.findMany({
			where: { studentId: ids.studentId, lessons: { gt: 0 } },
		}),
	});

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		stripeMock.listReversals.mockResolvedValue({ data: [] });
		stripeMock.createReversal.mockResolvedValue({ id: "trr_1" });
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		ids = {
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		};
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({
			sectionId: section.id,
			durationMinutes: 25,
		});
		await makeLessonProgress({
			lessonId: lesson.id,
			studentId: student.id,
			isCompleted: true,
			completedAt: NOW,
		});
		enrollmentId = (
			await makeEnrollment({
				studentId: student.id,
				courseId: course.id,
				status: "completed",
				completedAt: NOW,
				progress: 100,
			})
		).id;
		await makeConversation(ids);
		await makeCourseReview({ studentId: student.id, courseId: course.id });
	});

	it("applies every effect to a held sale (dashboard refund)", async () => {
		const payment = await seedPayment();
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId: ids.studentId,
			courseId: ids.courseId,
			refundState: "processing",
		});

		expect(
			await refundEffectsService.apply({
				paymentId: payment.id,
				path: "dashboard_refund",
				now: NOW,
			}),
		).toBe(true);

		const after = await reload(payment.id);
		expect(after.payment).toMatchObject({
			status: "refunded",
			refundedAt: NOW,
			transferStatus: "cancelled",
		});
		expect(after.enrollment).toMatchObject({
			status: "cancelled",
			progress: 0,
			certificateRevokedAt: NOW,
			certificateRevokedReason: "dashboard_refund",
		});
		expect(after.conversation.closedAt).toEqual(NOW);
		expect(after.review.deletedAt).toEqual(NOW);
		expect(after.progress).toBe(0);
		expect(after.archive).toHaveLength(1);
		expect(
			await testDb.refundRequest.findUniqueOrThrow({
				where: { id: request.id },
			}),
		).toMatchObject({ refundState: "refunded", refundedAt: NOW });
		expect(stripeMock.createReversal).not.toHaveBeenCalled();
		expect(recompute).toHaveBeenCalledWith(ids.studentId);
	});

	it("reverses a share that was already released", async () => {
		const payment = await seedPayment({
			transferStatus: "transferred",
			stripeTransferId: "tr_1",
		});

		await refundEffectsService.apply({
			paymentId: payment.id,
			path: "dashboard_refund",
			now: NOW,
		});

		expect(stripeMock.createReversal).toHaveBeenCalledTimes(1);
		expect((await reload(payment.id)).payment.transferStatus).toBe("reversed");
	});

	it("does not reverse after a lost dispute — the platform bears it (DL)", async () => {
		const payment = await seedPayment({
			transferStatus: "transferred",
			stripeTransferId: "tr_1",
		});

		await refundEffectsService.apply({
			paymentId: payment.id,
			path: "lost_dispute",
			now: NOW,
		});

		expect(stripeMock.createReversal).not.toHaveBeenCalled();
		expect((await reload(payment.id)).payment.transferStatus).toBe(
			"transferred",
		);
	});

	it("keeps the enrollment and the records while another paid payment for the course remains (DC)", async () => {
		const duplicate = await seedPayment();
		await seedPayment();

		await refundEffectsService.apply({
			paymentId: duplicate.id,
			path: "dashboard_refund",
			now: NOW,
		});

		const after = await reload(duplicate.id);
		expect(after.payment.status).toBe("refunded");
		expect(after.enrollment.status).toBe("completed");
		expect(after.progress).toBe(1);
		expect(after.conversation.closedAt).toBeNull();
	});

	it("applies the effects once when two callers race (AC-C8)", async () => {
		const payment = await seedPayment({
			transferStatus: "transferred",
			stripeTransferId: "tr_1",
		});

		const results = await Promise.all([
			refundEffectsService.apply({
				paymentId: payment.id,
				path: "dashboard_refund",
				now: NOW,
			}),
			refundEffectsService.apply({
				paymentId: payment.id,
				path: "dashboard_refund",
				now: NOW,
			}),
		]);

		expect(results.filter(Boolean)).toHaveLength(1);
		expect(stripeMock.createReversal).toHaveBeenCalledTimes(1);
		const after = await reload(payment.id);
		expect(after.archive).toEqual([
			expect.objectContaining({ minutes: 25, lessons: 1 }),
		]);
	});

	it("does nothing for a payment that is not succeeded", async () => {
		const payment = await seedPayment({ status: "refunded", refundedAt: NOW });

		expect(
			await refundEffectsService.apply({
				paymentId: payment.id,
				path: "dashboard_refund",
				now: NOW,
			}),
		).toBe(false);
		expect((await reload(payment.id)).enrollment.status).toBe("completed");
	});
});
