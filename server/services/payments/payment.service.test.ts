import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Payment } from "@/generated/prisma";

// Explicit vi.fn() variables — avoids vi.mocked() and Stripe SDK typing issues
const mockCheckoutSessionsCreate = vi.fn();
const mockCheckoutSessionsRetrieve = vi.fn();

vi.mock("./stripe.client", () => ({
	stripe: {
		checkout: {
			sessions: {
				create: mockCheckoutSessionsCreate,
				retrieve: mockCheckoutSessionsRetrieve,
			},
		},
	},
}));

// Mock payment repository
const mockPaymentRepo = {
	findBySessionId: vi.fn(),
	claimCheckout: vi.fn(),
	findByPaymentIntentId: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	findMany: vi.fn(),
	getOwedBalance: vi.fn(),
	aggregate: vi.fn(),
	getInstructorRevenueStats: vi.fn(),
	getRevenueByBucket: vi.fn(),
	getRevenueGroupedByCourse: vi.fn(),
};
vi.mock("@/server/repositories/payment.repository", () => ({
	paymentRepository: mockPaymentRepo,
}));

// Mock course repository
const mockCourseRepo = {
	findFirst: vi.fn(),
	findMany: vi.fn(),
};
vi.mock("@/server/repositories/course.repository", () => ({
	courseRepository: mockCourseRepo,
}));

// Mock enrollment repository
const mockEnrollmentRepo = {
	findFirst: vi.fn(),
	update: vi.fn(),
};
vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));

// Mock enrollment service
const mockEnrollmentService = {
	enrollInCourse: vi.fn(),
};
vi.mock("@/server/services/enrollment/enrollment.service", () => ({
	enrollmentService: mockEnrollmentService,
}));

// Mock connect service
const mockConnectService = {
	reverseTransfer: vi.fn(),
};
vi.mock("@/server/services/payments/connect.service", () => ({
	connectService: mockConnectService,
}));

// Mock env
vi.mock("@/lib/env", () => ({
	env: {
		BASE_URL: "https://learnix.test",
		STRIPE_SECRET_KEY: "sk_test_mock",
		STRIPE_WEBHOOK_SECRET: "whsec_mock",
		STRIPE_PLATFORM_FEE_PERCENT: 20,
	},
}));

const { paymentService } = await import("./payment.service");
const { paymentRepository } = await import(
	"@/server/repositories/payment.repository"
);
const { courseRepository } = await import(
	"@/server/repositories/course.repository"
);

const STUDENT_ID = "student-1";
const INSTRUCTOR_ID = "instructor-1";
const COURSE_ID = "course-1";
const PAYMENT_ID = "pay-1";
const SESSION_ID = "cs_test_123";
const PAYMENT_INTENT_ID = "pi_test_456";

function makeCourse(
	overrides: Partial<{
		id: string;
		priceCents: number;
		instructorId: string;
		status: string;
		deletedAt: Date | null;
		title: string;
	}> = {},
) {
	return {
		id: COURSE_ID,
		title: "Test Course",
		priceCents: 4999,
		instructorId: INSTRUCTOR_ID,
		status: "published",
		deletedAt: null,
		...overrides,
	};
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
	return {
		id: PAYMENT_ID,
		studentId: STUDENT_ID,
		courseId: COURSE_ID,
		instructorId: INSTRUCTOR_ID,
		amountCents: 4999,
		currency: "usd",
		status: "pending",
		platformFeeCents: null,
		instructorNetCents: null,
		transferStatus: "none",
		stripeTransferId: null,
		transferredAt: null,
		stripeCheckoutSessionId: SESSION_ID,
		stripePaymentIntentId: null,
		paidAt: null,
		disputeState: null,
		disputeUpdatedAt: null,
		refundSource: null,
		needsReviewAt: null,
		stripeFeeCents: null,
		refundedAmountCents: null,
		bankFailureAt: null,
		refundedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockCheckoutSessionsCreate.mockReset();
	mockCheckoutSessionsRetrieve.mockReset();
});

// -----------------------------------------------------------------------
// createCheckoutSession — guard rails (FR5)
// -----------------------------------------------------------------------

describe("PaymentService.createCheckoutSession — guard rails", () => {
	it("throws CourseIsFreeError for a course with priceCents = 0", async () => {
		mockCourseRepo.findFirst.mockResolvedValue(makeCourse({ priceCents: 0 }));
		mockEnrollmentRepo.findFirst.mockResolvedValue(null);

		await expect(
			paymentService.createCheckoutSession(STUDENT_ID, COURSE_ID),
		).rejects.toMatchObject({ message: "This course is free" });
	});

	it("throws CourseNotPurchasableError when student is the instructor", async () => {
		mockCourseRepo.findFirst.mockResolvedValue(
			makeCourse({ instructorId: STUDENT_ID }),
		);

		await expect(
			paymentService.createCheckoutSession(STUDENT_ID, COURSE_ID),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("throws AlreadyEnrolledError when student has an active enrollment", async () => {
		mockCourseRepo.findFirst.mockResolvedValue(makeCourse());
		mockEnrollmentRepo.findFirst.mockResolvedValue({
			id: "enroll-1",
			status: "active",
		});

		await expect(
			paymentService.createCheckoutSession(STUDENT_ID, COURSE_ID),
		).rejects.toMatchObject({
			message: "You are already enrolled in this course",
		});
	});

	it("throws AlreadyEnrolledError when student has a completed enrollment", async () => {
		mockCourseRepo.findFirst.mockResolvedValue(makeCourse());
		mockEnrollmentRepo.findFirst.mockResolvedValue({
			id: "enroll-1",
			status: "completed",
		});

		await expect(
			paymentService.createCheckoutSession(STUDENT_ID, COURSE_ID),
		).rejects.toMatchObject({
			message: "You are already enrolled in this course",
		});
	});

	it("throws CourseNotPurchasableError when course is not found / not published", async () => {
		mockCourseRepo.findFirst.mockResolvedValue(null);

		await expect(
			paymentService.createCheckoutSession(STUDENT_ID, COURSE_ID),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("creates a Stripe checkout session and returns the URL for a valid purchase", async () => {
		mockCourseRepo.findFirst.mockResolvedValue(makeCourse());
		mockEnrollmentRepo.findFirst.mockResolvedValue(null);
		mockPaymentRepo.create.mockResolvedValue(makePayment());
		mockPaymentRepo.update.mockResolvedValue(
			makePayment({ stripeCheckoutSessionId: SESSION_ID }),
		);
		mockCheckoutSessionsCreate.mockResolvedValue({
			id: SESSION_ID,
			url: "https://checkout.stripe.com/pay/cs_test_123",
		});

		const result = await paymentService.createCheckoutSession(
			STUDENT_ID,
			COURSE_ID,
		);

		expect(result).toEqual({
			url: "https://checkout.stripe.com/pay/cs_test_123",
		});
		expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "payment",
				line_items: [
					expect.objectContaining({
						price_data: expect.objectContaining({
							currency: "usd",
							unit_amount: 4999,
						}),
						quantity: 1,
					}),
				],
			}),
		);
	});
});

// -----------------------------------------------------------------------
// finalizeCheckout — idempotency
// -----------------------------------------------------------------------

describe("PaymentService.finalizeCheckout — idempotency", () => {
	it("does not re-enroll or re-transfer on a second call when payment already succeeded", async () => {
		const succeededPayment = makePayment({
			status: "succeeded",
			stripePaymentIntentId: PAYMENT_INTENT_ID,
		});
		mockPaymentRepo.findBySessionId.mockResolvedValue(succeededPayment);

		const result = await paymentService.finalizeCheckout(SESSION_ID);

		expect(result).toEqual({ status: "succeeded" });
		expect(mockEnrollmentService.enrollInCourse).not.toHaveBeenCalled();
		expect(mockPaymentRepo.update).not.toHaveBeenCalled();
	});

	it("makes no transfer for an already-succeeded payment that was never transferred (H9)", async () => {
		mockPaymentRepo.findBySessionId.mockResolvedValue(
			makePayment({ status: "succeeded", transferStatus: "none" }),
		);

		const result = await paymentService.finalizeCheckout(SESSION_ID);

		expect(result).toEqual({ status: "succeeded" });
		expect(mockPaymentRepo.update).not.toHaveBeenCalled();
		expect(mockCheckoutSessionsRetrieve).not.toHaveBeenCalled();
	});

	it("returns pending when Stripe payment_status is not paid", async () => {
		const pendingPayment = makePayment({ status: "pending" });
		mockPaymentRepo.findBySessionId.mockResolvedValue(pendingPayment);
		mockCheckoutSessionsRetrieve.mockResolvedValue({
			payment_status: "unpaid",
			payment_intent: null,
		});

		const result = await paymentService.finalizeCheckout(SESSION_ID);

		expect(result).toEqual({ status: "pending" });
		expect(mockEnrollmentService.enrollInCourse).not.toHaveBeenCalled();
	});

	it("enrolls the student and holds the instructor's net — no transfer at sale (FR-P1)", async () => {
		const pendingPayment = makePayment({ status: "pending" });
		mockPaymentRepo.findBySessionId.mockResolvedValue(pendingPayment);
		mockCheckoutSessionsRetrieve.mockResolvedValue({
			payment_status: "paid",
			payment_intent: PAYMENT_INTENT_ID,
		});
		mockPaymentRepo.claimCheckout.mockResolvedValue("paid");
		mockEnrollmentService.enrollInCourse.mockResolvedValue(undefined);

		const result = await paymentService.finalizeCheckout(SESSION_ID);

		expect(result).toEqual({ status: "succeeded" });
		expect(mockEnrollmentService.enrollInCourse).toHaveBeenCalledWith(
			STUDENT_ID,
			COURSE_ID,
		);
		expect(mockPaymentRepo.claimCheckout).toHaveBeenCalledWith(
			expect.objectContaining({
				paymentId: PAYMENT_ID,
				data: expect.objectContaining({
					platformFeeCents: expect.any(Number),
					instructorNetCents: expect.any(Number),
				}),
			}),
		);
	});
});

describe("PaymentService.finalizeCheckout — paidAt (refund window start)", () => {
	const CHARGE_CREATED = 1_763_800_000;

	beforeEach(() => {
		mockPaymentRepo.findBySessionId.mockResolvedValue(
			makePayment({ status: "pending" }),
		);
		mockPaymentRepo.claimCheckout.mockResolvedValue("paid");
		mockEnrollmentService.enrollInCourse.mockResolvedValue(undefined);
	});

	it("stores paidAt from the Stripe charge's created time", async () => {
		mockCheckoutSessionsRetrieve.mockResolvedValue({
			payment_status: "paid",
			payment_intent: {
				id: PAYMENT_INTENT_ID,
				latest_charge: { id: "ch_1", created: CHARGE_CREATED },
			},
		});

		await paymentService.finalizeCheckout(SESSION_ID);

		expect(mockPaymentRepo.claimCheckout).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					stripePaymentIntentId: PAYMENT_INTENT_ID,
					paidAt: new Date(CHARGE_CREATED * 1000),
					stripeFeeCents: null,
				}),
			}),
		);
	});

	it("reads the charge in the same single Stripe call, by expanding it", async () => {
		mockCheckoutSessionsRetrieve.mockResolvedValue({
			payment_status: "paid",
			payment_intent: PAYMENT_INTENT_ID,
		});

		await paymentService.finalizeCheckout(SESSION_ID);

		expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledTimes(1);
		expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledWith(SESSION_ID, {
			expand: ["payment_intent.latest_charge.balance_transaction"],
		});
	});

	it("leaves paidAt null and still succeeds when the charge is not on the session", async () => {
		mockCheckoutSessionsRetrieve.mockResolvedValue({
			payment_status: "paid",
			payment_intent: PAYMENT_INTENT_ID,
		});

		const result = await paymentService.finalizeCheckout(SESSION_ID);

		expect(result).toEqual({ status: "succeeded" });
		expect(mockPaymentRepo.claimCheckout).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					stripePaymentIntentId: PAYMENT_INTENT_ID,
					paidAt: null,
					stripeFeeCents: null,
				}),
			}),
		);
	});
});

// -----------------------------------------------------------------------
// getInstructorEarnings
// -----------------------------------------------------------------------

describe("PaymentService.getInstructorEarnings", () => {
	it("returns aggregated earnings data for an instructor", async () => {
		mockPaymentRepo.aggregate
			.mockResolvedValueOnce({ _sum: { instructorNetCents: 8000 } }) // transferred
			.mockResolvedValueOnce({ _sum: { amountCents: 15000 } }) // lifetime gross
			.mockResolvedValueOnce({ _sum: { platformFeeCents: 3000 } }); // platform fees
		mockPaymentRepo.getOwedBalance.mockResolvedValue(2000);

		const result = await paymentService.getInstructorEarnings(INSTRUCTOR_ID);

		expect(result).toEqual({
			availableCents: 8000,
			owedCents: 2000,
			lifetimeGrossCents: 15000,
			platformFeesCents: 3000,
		});
	});

	it("returns zeros when there are no payments", async () => {
		mockPaymentRepo.aggregate
			.mockResolvedValueOnce({ _sum: { instructorNetCents: null } })
			.mockResolvedValueOnce({ _sum: { amountCents: null } })
			.mockResolvedValueOnce({ _sum: { platformFeeCents: null } });
		mockPaymentRepo.getOwedBalance.mockResolvedValue(0);

		const result = await paymentService.getInstructorEarnings(INSTRUCTOR_ID);

		expect(result).toEqual({
			availableCents: 0,
			owedCents: 0,
			lifetimeGrossCents: 0,
			platformFeesCents: 0,
		});
	});
});

afterEach(() => vi.restoreAllMocks());

// -----------------------------------------------------------------------
// getRevenueSummary
// -----------------------------------------------------------------------

describe("paymentService.getRevenueSummary", () => {
	it("maps earnings + month stats into the summary DTO with a delta", async () => {
		vi.spyOn(paymentService, "getInstructorEarnings").mockResolvedValue({
			availableCents: 8420,
			owedCents: 2180,
			lifetimeGrossCents: 95150,
			platformFeesCents: 19030,
		});
		vi.spyOn(paymentRepository, "getInstructorRevenueStats").mockResolvedValue({
			lifetimeGrossCents: 95150,
			thisMonthGrossCents: 12450,
			lastMonthGrossCents: 11500,
		});

		const summary = await paymentService.getRevenueSummary("inst_1");

		expect(summary.totalGrossCents).toBe(95150);
		expect(summary.paidOutCents).toBe(8420);
		expect(summary.pendingCents).toBe(2180);
		expect(summary.thisMonth.grossCents).toBe(12450);
		expect(summary.thisMonth.delta).toEqual({
			kind: "percent",
			value: 8,
			direction: "up",
		});
	});

	it("returns a 'new' delta when last month was zero", async () => {
		vi.spyOn(paymentService, "getInstructorEarnings").mockResolvedValue({
			availableCents: 0,
			owedCents: 0,
			lifetimeGrossCents: 5000,
			platformFeesCents: 1000,
		});
		vi.spyOn(paymentRepository, "getInstructorRevenueStats").mockResolvedValue({
			lifetimeGrossCents: 5000,
			thisMonthGrossCents: 5000,
			lastMonthGrossCents: 0,
		});

		const summary = await paymentService.getRevenueSummary("inst_1");
		expect(summary.thisMonth.delta).toEqual({ kind: "new" });
	});
});

// -----------------------------------------------------------------------
// getRevenueTimeSeries
// -----------------------------------------------------------------------

describe("paymentService.getRevenueTimeSeries", () => {
	it("gap-fills exactly 30 daily buckets for 30d range", async () => {
		vi.setSystemTime(new Date(2026, 5, 16)); // Jun 16
		vi.spyOn(paymentRepository, "getRevenueByBucket").mockResolvedValue([]);

		const series = await paymentService.getRevenueTimeSeries("inst_1", "30d");
		expect(series).toHaveLength(30);
		vi.useRealTimers();
	});

	it("gap-fills missing monthly buckets with zeros, ascending", async () => {
		vi.setSystemTime(new Date(2026, 5, 16)); // Jun 2026; 6m → Jan..Jun
		vi.spyOn(paymentRepository, "getRevenueByBucket").mockResolvedValue([
			{
				period: new Date("2026-03-01T00:00:00Z"),
				grossCents: 15000,
				netCents: 12000,
			}, // Mar only; UTC-anchored to match how date_trunc() rows actually round-trip
		]);

		const series = await paymentService.getRevenueTimeSeries("inst_1", "6m");

		expect(series).toHaveLength(6); // Jan..Jun
		expect(series[0]).toMatchObject({ grossCents: 0, netCents: 0 });
		const march = series.find((p) => p.period.startsWith("2026-03"));
		expect(march).toMatchObject({ grossCents: 15000, netCents: 12000 });
		vi.useRealTimers();
	});
});

// -----------------------------------------------------------------------
// getRevenueByCourse
// -----------------------------------------------------------------------

describe("paymentService.getRevenueByCourse", () => {
	it("hydrates titles and preserves repo ranking", async () => {
		vi.setSystemTime(new Date(2026, 5, 16));
		vi.spyOn(paymentRepository, "getRevenueGroupedByCourse").mockResolvedValue([
			{ courseId: "c2", grossCents: 8000 },
			{ courseId: "c1", grossCents: 3000 },
		]);
		vi.spyOn(courseRepository, "findMany").mockResolvedValue([
			{ id: "c1", title: "React" },
			{ id: "c2", title: "Web Dev" },
		] as never);

		const result = await paymentService.getRevenueByCourse("inst_1", "12m");
		expect(result).toEqual([
			{ courseId: "c2", title: "Web Dev", grossCents: 8000 },
			{ courseId: "c1", title: "React", grossCents: 3000 },
		]);
		vi.useRealTimers();
	});
});

// -----------------------------------------------------------------------
// getRecentTransactions
// -----------------------------------------------------------------------

describe("paymentService.getRecentTransactions", () => {
	it("maps payment rows to the transaction DTO with derived status", async () => {
		vi.spyOn(paymentRepository, "findMany").mockResolvedValue([
			{
				id: "p1",
				amountCents: 8900,
				status: "succeeded",
				refundedAt: null,
				createdAt: new Date(2026, 5, 14),
				course: { title: "Web Dev" },
				student: { name: "Sarah Johnson" },
			},
			{
				id: "p2",
				amountCents: 6900,
				status: "succeeded",
				refundedAt: new Date(2026, 5, 11),
				createdAt: new Date(2026, 5, 10),
				course: { title: "TypeScript" },
				student: { name: null },
			},
		] as never);

		const txns = await paymentService.getRecentTransactions("inst_1", 10);
		expect(txns[0]).toEqual({
			id: "p1",
			courseTitle: "Web Dev",
			studentName: "Sarah Johnson",
			createdAt: new Date(2026, 5, 14),
			amountCents: 8900,
			status: "completed",
		});
		expect(txns[1]).toMatchObject({
			status: "refunded",
			studentName: "Unknown",
		});
	});
});
