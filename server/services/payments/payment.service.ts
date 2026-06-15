import { EnrollmentStatus } from "@/generated/prisma";
import { env } from "@/lib/env";
import { computeSplit } from "@/lib/platformFee";
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

	async finalizeCheckout(sessionId: string): Promise<{ status: string }> {
		// 1. Find payment by sessionId
		const payment = await paymentRepository.findBySessionId(sessionId);

		if (!payment) {
			return { status: "not_found" };
		}

		// 3. Idempotency — already succeeded
		if (payment.status === "succeeded") {
			// Retry transfer if it was never attempted (e.g., prior run threw after marking succeeded)
			if (payment.transferStatus === "none" && payment.instructorNetCents) {
				await connectService.transferToInstructor(payment);
			}
			return { status: "succeeded" };
		}

		// 2. Retrieve session from Stripe
		const session = await stripe.checkout.sessions.retrieve(sessionId);

		// 4. Not paid yet
		if (session.payment_status !== "paid") {
			return { status: "pending" };
		}

		// 5. Mark payment succeeded + store stripePaymentIntentId
		const updatedPayment = await paymentRepository.update(payment.id, {
			status: "succeeded",
			stripePaymentIntentId:
				typeof session.payment_intent === "string"
					? session.payment_intent
					: (session.payment_intent?.id ?? null),
		});

		// 6. Enroll the student
		await enrollmentService.enrollInCourse(payment.studentId, payment.courseId);

		// 7. Compute the platform/instructor split
		const { platformFeeCents, instructorNetCents } = computeSplit(
			payment.amountCents,
			env.STRIPE_PLATFORM_FEE_PERCENT,
		);

		// 8. Persist split amounts
		const paymentWithSplit = await paymentRepository.update(updatedPayment.id, {
			platformFeeCents,
			instructorNetCents,
		});

		// 9. Attempt transfer to instructor (handles onboarding check internally)
		await connectService.transferToInstructor(paymentWithSplit);

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
}

export const paymentService = new PaymentService();
