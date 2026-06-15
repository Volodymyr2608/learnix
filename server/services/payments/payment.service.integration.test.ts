import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnrollmentStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";

// Mock Stripe — real DB, fake Stripe API calls
const mockCheckoutSessionsCreate = vi.fn();
const mockCheckoutSessionsRetrieve = vi.fn();
const mockTransfersCreate = vi.fn();
const mockTransfersCreateReversal = vi.fn();
const mockAccountsRetrieve = vi.fn();

vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		checkout: {
			sessions: {
				create: mockCheckoutSessionsCreate,
				retrieve: mockCheckoutSessionsRetrieve,
			},
		},
		transfers: {
			create: mockTransfersCreate,
			createReversal: mockTransfersCreateReversal,
		},
		accounts: {
			retrieve: mockAccountsRetrieve,
		},
	},
}));

// Mock embeddings (called as a side-effect in enrollInCourse)
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: {
		recomputeUserInterest: vi.fn().mockResolvedValue(undefined),
	},
}));

// Mock email service (called as a side-effect in enrollInCourse)
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send: vi.fn().mockResolvedValue(undefined) },
}));

const { paymentService } = await import("./payment.service");
const { paymentRepository } = await import(
	"@/server/repositories/payment.repository"
);

const SESSION_ID = "cs_test_integration_1";
const PAYMENT_INTENT_ID = "pi_test_integration_1";
const TRANSFER_ID = "tr_test_integration_1";

beforeEach(() => {
	vi.clearAllMocks();
	mockCheckoutSessionsCreate.mockReset();
	mockCheckoutSessionsRetrieve.mockReset();
	mockTransfersCreate.mockReset();
	mockTransfersCreateReversal.mockReset();
});

async function makePaymentRecord(overrides: {
	studentId: string;
	instructorId: string;
	courseId: string;
	status?: "pending" | "succeeded" | "failed" | "refunded";
	transferStatus?: "none" | "pending" | "transferred" | "reversed";
	stripeCheckoutSessionId?: string;
	stripePaymentIntentId?: string;
	stripeTransferId?: string;
	amountCents?: number;
	platformFeeCents?: number;
	instructorNetCents?: number;
}) {
	return testDb.payment.create({
		data: {
			amountCents: 4999,
			platformFeeCents: 1000,
			instructorNetCents: 3999,
			currency: "usd",
			status: "pending",
			transferStatus: "none",
			...overrides,
		},
	});
}

describe("PaymentService.finalizeCheckout — integration", () => {
	it("creates exactly one enrollment even when called twice (idempotency)", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
			priceCents: 4999,
		});

		// Create an instructor profile so connectService can find it
		await testDb.instructorProfile.create({
			data: {
				userId: instructor.id,
				areaOfExpertise: "Technology",
				teachingExperience: "5 years",
				professionalBio: "Test bio",
				courseIdea: "Test idea",
				stripePayoutsEnabled: false,
				stripeChargesEnabled: false,
			},
		});

		const payment = await makePaymentRecord({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			stripeCheckoutSessionId: SESSION_ID,
		});

		mockCheckoutSessionsRetrieve.mockResolvedValue({
			payment_status: "paid",
			payment_intent: PAYMENT_INTENT_ID,
		});

		// First call — should enroll and persist the split
		await paymentService.finalizeCheckout(SESSION_ID);

		// Second call — payment is now "succeeded", so it returns early
		await paymentService.finalizeCheckout(SESSION_ID);

		const enrollments = await testDb.enrollment.findMany({
			where: { studentId: student.id, courseId: course.id },
		});
		expect(enrollments).toHaveLength(1);
		expect(enrollments[0]?.status).toBe(EnrollmentStatus.active);

		// Ensure Stripe retrieve was only called once (on the first call)
		expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledTimes(1);

		// Verify payment is marked succeeded with split persisted
		const finalPayment = await paymentRepository.findBySessionId(SESSION_ID);
		expect(finalPayment?.status).toBe("succeeded");
		expect(finalPayment?.platformFeeCents).toBeGreaterThan(0);
		expect(finalPayment?.instructorNetCents).toBeGreaterThan(0);
		expect(finalPayment?.id).toBe(payment.id);
	});

	it("does not enroll when Stripe payment_status is not paid", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
			priceCents: 4999,
		});

		await makePaymentRecord({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			stripeCheckoutSessionId: SESSION_ID,
		});

		mockCheckoutSessionsRetrieve.mockResolvedValue({
			payment_status: "unpaid",
			payment_intent: null,
		});

		const result = await paymentService.finalizeCheckout(SESSION_ID);

		expect(result).toEqual({ status: "pending" });

		const enrollments = await testDb.enrollment.findMany({
			where: { studentId: student.id, courseId: course.id },
		});
		expect(enrollments).toHaveLength(0);
	});
});

describe("PaymentService.handleRefund — integration", () => {
	it("marks payment refunded and cancels enrollment", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
			priceCents: 4999,
		});

		await makePaymentRecord({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			stripePaymentIntentId: PAYMENT_INTENT_ID,
			status: "succeeded",
			transferStatus: "pending",
		});

		// Create active enrollment
		await testDb.enrollment.create({
			data: {
				studentId: student.id,
				courseId: course.id,
				status: EnrollmentStatus.active,
			},
		});

		await paymentService.handleRefund(PAYMENT_INTENT_ID);

		// Payment should be refunded
		const payment =
			await paymentRepository.findByPaymentIntentId(PAYMENT_INTENT_ID);
		expect(payment?.status).toBe("refunded");
		expect(payment?.refundedAt).not.toBeNull();

		// Enrollment should be cancelled
		const enrollment = await testDb.enrollment.findFirst({
			where: { studentId: student.id, courseId: course.id },
		});
		expect(enrollment?.status).toBe(EnrollmentStatus.cancelled);

		// No Stripe reversal since transfer was pending (not yet sent)
		expect(mockTransfersCreateReversal).not.toHaveBeenCalled();
	});

	it("calls reverseTransfer when payment transferStatus is transferred", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
			priceCents: 4999,
		});

		await makePaymentRecord({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			stripePaymentIntentId: PAYMENT_INTENT_ID,
			stripeTransferId: TRANSFER_ID,
			status: "succeeded",
			transferStatus: "transferred",
		});

		await testDb.enrollment.create({
			data: {
				studentId: student.id,
				courseId: course.id,
				status: EnrollmentStatus.active,
			},
		});

		mockTransfersCreateReversal.mockResolvedValue({ id: "trr_test" });

		await paymentService.handleRefund(PAYMENT_INTENT_ID);

		expect(mockTransfersCreateReversal).toHaveBeenCalledWith(
			TRANSFER_ID,
			expect.objectContaining({ refund_application_fee: false }),
		);

		const enrollment = await testDb.enrollment.findFirst({
			where: { studentId: student.id, courseId: course.id },
		});
		expect(enrollment?.status).toBe(EnrollmentStatus.cancelled);
	});
});

describe("PaymentService.getInstructorEarnings — integration", () => {
	it("returns correct aggregated earnings", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
			priceCents: 4999,
		});

		// Transferred payment
		await makePaymentRecord({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			status: "succeeded",
			transferStatus: "transferred",
			amountCents: 5000,
			platformFeeCents: 1000,
			instructorNetCents: 4000,
		});

		// Pending (owed) payment
		await makePaymentRecord({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			status: "succeeded",
			transferStatus: "pending",
			amountCents: 3000,
			platformFeeCents: 600,
			instructorNetCents: 2400,
		});

		const earnings = await paymentService.getInstructorEarnings(instructor.id);

		expect(earnings.availableCents).toBe(4000);
		expect(earnings.owedCents).toBe(2400);
		expect(earnings.lifetimeGrossCents).toBe(8000);
		expect(earnings.platformFeesCents).toBe(1600);
	});
});
