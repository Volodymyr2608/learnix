import type Stripe from "stripe";
import { EnrollmentStatus } from "@/generated/prisma";
import { env } from "@/lib/env";
import { computeSplit } from "@/lib/platformFee";
import { computeDelta } from "@/lib/stats/computeDelta";
import { fillBuckets } from "@/lib/stats/fillBuckets";
import { resolveRange } from "@/lib/stats/revenueRange";
import type {
	RevenueByCourseItem,
	RevenueRange,
	RevenueSummary,
	RevenueTimeSeriesPoint,
	RevenueTransaction,
	RevenueTransactionStatus,
} from "@/server/entities/payment/revenue";
import { courseRepository } from "@/server/repositories/course.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { enrollmentService } from "@/server/services/enrollment/enrollment.service";
import {
	AlreadyEnrolledError,
	CourseIsFreeError,
	CourseNotPurchasableError,
} from "@/server/services/payments/payment.errors";
import { connectService } from "./connect.service";
import { stripe } from "./stripe.client";

/**
 * The Stripe charge's creation time, or null when the charge is not expanded on
 * the session. A null paidAt is outside the refund window (P4, fail closed).
 */
const chargeCreatedAt = (
	paymentIntent: Stripe.Checkout.Session["payment_intent"],
): Date | null => {
	if (!paymentIntent || typeof paymentIntent === "string") return null;
	const charge = paymentIntent.latest_charge;
	if (!charge || typeof charge === "string") return null;
	return new Date(charge.created * 1000);
};

class PaymentService {
	async createCheckoutSession(
		studentId: string,
		courseId: string,
	): Promise<{ url: string }> {
		// 1. Load the course (published, not deleted)
		const course = await courseRepository.findFirst({
			where: { id: courseId, status: "published", deletedAt: null },
			select: {
				id: true,
				title: true,
				priceCents: true,
				instructorId: true,
			},
		});

		if (!course) {
			throw new CourseNotPurchasableError({ courseId });
		}

		// 2. Free course check
		if (course.priceCents === 0) {
			throw new CourseIsFreeError({ courseId });
		}

		// 3. Own course check
		if (course.instructorId === studentId) {
			throw new CourseNotPurchasableError({ courseId, studentId });
		}

		// 4. Check existing active/completed enrollment
		const existingEnrollment = await enrollmentRepository.findFirst({
			where: {
				studentId,
				courseId,
				status: { in: [EnrollmentStatus.active, EnrollmentStatus.completed] },
			},
			select: { id: true, status: true },
		});

		if (existingEnrollment) {
			throw new AlreadyEnrolledError({ courseId, studentId });
		}

		// 5. Create a pending Payment record
		const payment = await paymentRepository.create({
			studentId,
			courseId,
			instructorId: course.instructorId,
			amountCents: course.priceCents,
			currency: "usd",
			status: "pending",
		});

		// 6. Create Stripe checkout session
		const session = await stripe.checkout.sessions.create({
			mode: "payment",
			line_items: [
				{
					price_data: {
						currency: "usd",
						unit_amount: course.priceCents,
						product_data: { name: course.title },
					},
					quantity: 1,
				},
			],
			success_url: `${env.BASE_URL}/dashboard/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${env.BASE_URL}/dashboard/courses/${courseId}`,
			client_reference_id: payment.id,
			metadata: { paymentId: payment.id },
		});

		// 7. Persist the session id back on the payment
		await paymentRepository.update(payment.id, {
			stripeCheckoutSessionId: session.id,
		});

		if (!session.url) {
			throw new Error("Stripe checkout session did not return a URL");
		}

		return { url: session.url };
	}

	/**
	 * FR-P26 / C28 — the status a student polls after checkout. Only the student who owns the
	 * session may finalize it; anyone else gets "not_found" and nothing changes. The signed
	 * webhook calls finalizeCheckout directly.
	 */
	async finalizeCheckoutForStudent(
		sessionId: string,
		studentId: string,
	): Promise<{ status: string }> {
		const owned = await paymentRepository.findBySessionIdForStudent(
			sessionId,
			studentId,
		);
		if (!owned) return { status: "not_found" };
		return this.finalizeCheckout(sessionId);
	}

	async finalizeCheckout(sessionId: string): Promise<{ status: string }> {
		// 1. Find payment by sessionId
		const payment = await paymentRepository.findBySessionId(sessionId);

		if (!payment) {
			return { status: "not_found" };
		}

		// 3. Idempotency — already succeeded. No transfer here (H9): the release job pays it later.
		if (payment.status === "succeeded") {
			return { status: "succeeded" };
		}

		// 2. Retrieve session from Stripe
		// The charge is expanded so paidAt (the refund window start, FR "window")
		// comes from the same call.
		const session = await stripe.checkout.sessions.retrieve(sessionId, {
			expand: ["payment_intent.latest_charge"],
		});

		// 4. Not paid yet
		if (session.payment_status !== "paid") {
			return { status: "pending" };
		}

		// 5. Mark payment succeeded + store stripePaymentIntentId and paidAt
		const updatedPayment = await paymentRepository.update(payment.id, {
			status: "succeeded",
			stripePaymentIntentId:
				typeof session.payment_intent === "string"
					? session.payment_intent
					: (session.payment_intent?.id ?? null),
			paidAt: chargeCreatedAt(session.payment_intent),
		});

		// 6. Enroll the student
		await enrollmentService.enrollInCourse(payment.studentId, payment.courseId);

		// 7. Compute the platform/instructor split
		const { platformFeeCents, instructorNetCents } = computeSplit(
			payment.amountCents,
			env.STRIPE_PLATFORM_FEE_PERCENT,
		);

		// 8. Persist split amounts. The instructor's net is held, not transferred (FR-P1, ADR-037 §1):
		// the release job pays it once the refund window has closed.
		await paymentRepository.update(updatedPayment.id, {
			platformFeeCents,
			instructorNetCents,
			transferStatus: "pending",
		});

		return { status: "succeeded" };
	}

	async handleRefund(paymentIntentId: string): Promise<void> {
		// 1. Find payment by paymentIntentId
		const payment =
			await paymentRepository.findByPaymentIntentId(paymentIntentId);

		if (!payment) return;

		// 2. Mark refunded + set refundedAt
		await paymentRepository.update(payment.id, {
			status: "refunded",
			refundedAt: new Date(),
		});

		// 3. Cancel enrollment
		const enrollment = await enrollmentRepository.findFirst({
			where: { studentId: payment.studentId, courseId: payment.courseId },
			select: { id: true },
		});

		if (enrollment) {
			await enrollmentRepository.update(enrollment.id, {
				status: EnrollmentStatus.cancelled,
			});
		}

		// 4. Reverse transfer if already transferred
		if (payment.transferStatus === "transferred") {
			await connectService.reverseTransfer(payment);
		}
	}

	async getInstructorEarnings(instructorId: string) {
		const [
			transferredResult,
			lifetimeGrossResult,
			platformFeesResult,
			owedCents,
		] = await Promise.all([
			paymentRepository.aggregate({
				where: {
					instructorId,
					transferStatus: "transferred",
					status: "succeeded",
					refundedAt: null,
				},
				_sum: { instructorNetCents: true },
			}),
			paymentRepository.aggregate({
				where: { instructorId, status: "succeeded", refundedAt: null },
				_sum: { amountCents: true },
			}),
			paymentRepository.aggregate({
				where: { instructorId, status: "succeeded", refundedAt: null },
				_sum: { platformFeeCents: true },
			}),
			paymentRepository.getOwedBalance(instructorId),
		]);

		const availableCents =
			(transferredResult._sum as { instructorNetCents: number | null })
				.instructorNetCents ?? 0;
		const lifetimeGrossCents =
			(lifetimeGrossResult._sum as { amountCents: number | null })
				.amountCents ?? 0;
		const platformFeesCents =
			(platformFeesResult._sum as { platformFeeCents: number | null })
				.platformFeeCents ?? 0;

		return { availableCents, owedCents, lifetimeGrossCents, platformFeesCents };
	}

	async getRevenueSummary(instructorId: string): Promise<RevenueSummary> {
		const [earnings, monthStats] = await Promise.all([
			this.getInstructorEarnings(instructorId),
			paymentRepository.getInstructorRevenueStats(instructorId),
		]);
		return {
			totalGrossCents: earnings.lifetimeGrossCents,
			paidOutCents: earnings.availableCents,
			pendingCents: earnings.owedCents,
			thisMonth: {
				grossCents: monthStats.thisMonthGrossCents,
				delta: computeDelta(
					monthStats.thisMonthGrossCents,
					monthStats.lastMonthGrossCents,
				),
			},
		};
	}

	async getRevenueTimeSeries(
		instructorId: string,
		range: RevenueRange,
	): Promise<RevenueTimeSeriesPoint[]> {
		const now = new Date();
		const { since, bucket } = resolveRange(range, now);
		const rows = await paymentRepository.getRevenueByBucket(
			instructorId,
			since,
			bucket,
		);

		return fillBuckets(rows, since, now, bucket, {
			grossCents: 0,
			netCents: 0,
		});
	}

	async getRevenueByCourse(
		instructorId: string,
		range: RevenueRange,
	): Promise<RevenueByCourseItem[]> {
		const now = new Date();
		const { since } = resolveRange(range, now);
		const grouped = await paymentRepository.getRevenueGroupedByCourse(
			instructorId,
			since,
			5,
		);
		if (grouped.length === 0) return [];

		const courses = await courseRepository.findMany({
			where: { id: { in: grouped.map((g) => g.courseId) } },
			select: { id: true, title: true },
		});
		const titleById = new Map(courses.map((c) => [c.id, c.title]));

		return grouped.map((g) => ({
			courseId: g.courseId,
			title: titleById.get(g.courseId) ?? "Untitled course",
			grossCents: g.grossCents,
		}));
	}

	private toTransactionStatus(p: {
		status: string;
		refundedAt: Date | null;
	}): RevenueTransactionStatus {
		if (p.refundedAt) return "refunded";
		if (p.status === "succeeded") return "completed";
		if (p.status === "pending") return "pending";
		return "failed";
	}

	async getRecentTransactions(
		instructorId: string,
		limit: number,
	): Promise<RevenueTransaction[]> {
		const rows = await paymentRepository.findMany({
			where: { instructorId },
			orderBy: { createdAt: "desc" },
			take: limit,
			include: {
				course: { select: { title: true } },
				student: { select: { name: true } },
			},
		});
		return rows.map((p) => ({
			id: p.id,
			courseTitle: p.course?.title ?? "Untitled course",
			studentName: p.student?.name ?? "Unknown",
			createdAt: p.createdAt,
			amountCents: p.amountCents,
			status: this.toTransactionStatus(p),
		}));
	}
}

export const paymentService = new PaymentService();
