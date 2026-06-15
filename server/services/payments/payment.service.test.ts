import { beforeEach, describe, expect, it, vi } from "vitest";
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
	findByPaymentIntentId: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	getOwedBalance: vi.fn(),
	aggregate: vi.fn(),
};
vi.mock("@/server/repositories/payment.repository", () => ({
	paymentRepository: mockPaymentRepo,
}));

// Mock course repository
const mockCourseRepo = {
	findFirst: vi.fn(),
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
	transferToInstructor: vi.fn(),
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
		expect(mockConnectService.transferToInstructor).not.toHaveBeenCalled();
		expect(mockPaymentRepo.update).not.toHaveBeenCalled();
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

	it("enrolls student and triggers transfer when Stripe payment_status is paid", async () => {
		const pendingPayment = makePayment({ status: "pending" });
		mockPaymentRepo.findBySessionId.mockResolvedValue(pendingPayment);
		mockCheckoutSessionsRetrieve.mockResolvedValue({
			payment_status: "paid",
			payment_intent: PAYMENT_INTENT_ID,
		});
		mockPaymentRepo.update.mockResolvedValue(
			makePayment({ status: "succeeded" }),
		);
		mockEnrollmentService.enrollInCourse.mockResolvedValue(undefined);
		mockConnectService.transferToInstructor.mockResolvedValue(undefined);

		const result = await paymentService.finalizeCheckout(SESSION_ID);

		expect(result).toEqual({ status: "succeeded" });
		expect(mockEnrollmentService.enrollInCourse).toHaveBeenCalledWith(
			STUDENT_ID,
			COURSE_ID,
		);
		expect(mockConnectService.transferToInstructor).toHaveBeenCalled();
	});
});

// -----------------------------------------------------------------------
// handleRefund
// -----------------------------------------------------------------------

describe("PaymentService.handleRefund", () => {
	it("calls reverseTransfer AND cancels enrollment for a transferred payment", async () => {
		const transferredPayment = makePayment({
			status: "succeeded",
			transferStatus: "transferred",
			stripePaymentIntentId: PAYMENT_INTENT_ID,
			stripeTransferId: "tr_test",
		});
		mockPaymentRepo.findByPaymentIntentId.mockResolvedValue(transferredPayment);
		mockPaymentRepo.update.mockResolvedValue(
			makePayment({ status: "refunded" }),
		);
		mockEnrollmentRepo.findFirst.mockResolvedValue({
			id: "enroll-1",
			status: "active",
		});
		mockEnrollmentRepo.update.mockResolvedValue(undefined);
		mockConnectService.reverseTransfer.mockResolvedValue(undefined);

		await paymentService.handleRefund(PAYMENT_INTENT_ID);

		expect(mockConnectService.reverseTransfer).toHaveBeenCalledWith(
			transferredPayment,
		);
		expect(mockEnrollmentRepo.update).toHaveBeenCalledWith(
			"enroll-1",
			expect.objectContaining({ status: "cancelled" }),
		);
	});

	it("does NOT call reverseTransfer for a pending (owed) payment, just marks refunded and cancels", async () => {
		const pendingTransferPayment = makePayment({
			status: "succeeded",
			transferStatus: "pending",
			stripePaymentIntentId: PAYMENT_INTENT_ID,
		});
		mockPaymentRepo.findByPaymentIntentId.mockResolvedValue(
			pendingTransferPayment,
		);
		mockPaymentRepo.update.mockResolvedValue(
			makePayment({ status: "refunded" }),
		);
		mockEnrollmentRepo.findFirst.mockResolvedValue({
			id: "enroll-1",
			status: "active",
		});
		mockEnrollmentRepo.update.mockResolvedValue(undefined);

		await paymentService.handleRefund(PAYMENT_INTENT_ID);

		expect(mockConnectService.reverseTransfer).not.toHaveBeenCalled();
		expect(mockPaymentRepo.update).toHaveBeenCalledWith(
			PAYMENT_ID,
			expect.objectContaining({
				status: "refunded",
				refundedAt: expect.any(Date),
			}),
		);
		expect(mockEnrollmentRepo.update).toHaveBeenCalledWith(
			"enroll-1",
			expect.objectContaining({ status: "cancelled" }),
		);
	});
});

// -----------------------------------------------------------------------
// Transfer decision
// -----------------------------------------------------------------------

describe("PaymentService.finalizeCheckout — transfer decision", () => {
	it("calls transferToInstructor (which handles onboarding check internally)", async () => {
		const pendingPayment = makePayment({ status: "pending" });
		mockPaymentRepo.findBySessionId.mockResolvedValue(pendingPayment);
		mockCheckoutSessionsRetrieve.mockResolvedValue({
			payment_status: "paid",
			payment_intent: PAYMENT_INTENT_ID,
		});
		const succeededPayment = makePayment({ status: "succeeded" });
		mockPaymentRepo.update.mockResolvedValue(succeededPayment);
		mockEnrollmentService.enrollInCourse.mockResolvedValue(undefined);
		mockConnectService.transferToInstructor.mockResolvedValue(undefined);

		await paymentService.finalizeCheckout(SESSION_ID);

		// connectService.transferToInstructor is always called — it handles the
		// onboarding check internally (pending vs transferred)
		expect(mockConnectService.transferToInstructor).toHaveBeenCalled();
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
