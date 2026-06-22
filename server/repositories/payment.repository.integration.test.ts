import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";
import { paymentRepository } from "./payment.repository";

describe("PaymentRepository", () => {
	async function makePayment(
		overrides: Partial<{
			studentId: string;
			instructorId: string;
			courseId: string;
			stripeCheckoutSessionId: string;
			stripePaymentIntentId: string;
			amountCents: number;
			platformFeeCents: number;
			instructorNetCents: number;
			status: "pending" | "succeeded" | "failed" | "refunded";
			transferStatus: "none" | "pending" | "transferred" | "reversed";
			refundedAt: Date | null;
			createdAt: Date;
		}> & {
			studentId: string;
			instructorId: string;
			courseId: string;
		},
	) {
		return testDb.payment.create({
			data: {
				amountCents: 4999,
				platformFeeCents: 1000,
				instructorNetCents: 3999,
				status: "succeeded",
				transferStatus: "none",
				...overrides,
			},
		});
	}

	it("findBySessionId returns the correct payment", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			stripeCheckoutSessionId: "cs_test_abc123",
		});

		const found = await paymentRepository.findBySessionId("cs_test_abc123");
		expect(found?.id).toBe(payment.id);
		expect(found?.stripeCheckoutSessionId).toBe("cs_test_abc123");
	});

	it("findBySessionId returns null for an unknown session", async () => {
		const found = await paymentRepository.findBySessionId("cs_unknown");
		expect(found).toBeNull();
	});

	it("findByPaymentIntentId returns the correct payment", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			stripePaymentIntentId: "pi_test_xyz789",
		});

		const found =
			await paymentRepository.findByPaymentIntentId("pi_test_xyz789");
		expect(found?.id).toBe(payment.id);
		expect(found?.stripePaymentIntentId).toBe("pi_test_xyz789");
	});

	it("findByPaymentIntentId returns null for an unknown intent", async () => {
		const found = await paymentRepository.findByPaymentIntentId("pi_unknown");
		expect(found).toBeNull();
	});

	it("getOwedBalance sums instructorNetCents where transferStatus = pending", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		// Two pending transfers
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			instructorNetCents: 3000,
			transferStatus: "pending",
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			instructorNetCents: 2000,
			transferStatus: "pending",
		});
		// One already transferred — should not be included
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			instructorNetCents: 1500,
			transferStatus: "transferred",
		});

		const owed = await paymentRepository.getOwedBalance(instructor.id);
		expect(owed).toBe(5000);
	});

	it("getOwedBalance returns 0 when there are no pending transfers", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const owed = await paymentRepository.getOwedBalance(instructor.id);
		expect(owed).toBe(0);
	});

	it("getPlatformRevenue sums platformFeeCents for succeeded non-refunded payments", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		// Two succeeded, non-refunded payments
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			platformFeeCents: 800,
			status: "succeeded",
			refundedAt: null,
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			platformFeeCents: 1200,
			status: "succeeded",
			refundedAt: null,
		});
		// Refunded — should be excluded
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			platformFeeCents: 500,
			status: "succeeded",
			refundedAt: new Date(),
		});
		// Failed — should be excluded
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			platformFeeCents: 300,
			status: "failed",
			refundedAt: null,
		});

		const revenue = await paymentRepository.getPlatformRevenue();
		expect(revenue).toBe(2000);
	});

	it("getPlatformRevenue returns 0 when there are no qualifying payments", async () => {
		const revenue = await paymentRepository.getPlatformRevenue();
		expect(revenue).toBe(0);
	});

	it("getRevenueByBucket sums gross and net per month, excluding refunded/failed", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		// Two succeeded sales in Mar 2026 + one refunded (excluded).
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 10000,
			instructorNetCents: 8000,
			createdAt: new Date(2026, 2, 5),
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 5000,
			instructorNetCents: 4000,
			createdAt: new Date(2026, 2, 20),
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 9999,
			instructorNetCents: 8000,
			status: "refunded",
			refundedAt: new Date(2026, 2, 25),
			createdAt: new Date(2026, 2, 25),
		});

		const rows = await paymentRepository.getRevenueByBucket(
			instructor.id,
			new Date(2026, 0, 1),
			"month",
		);

		const march = rows.find(
			(r) => r.period.getUTCMonth() === 2 && r.period.getUTCFullYear() === 2026,
		);
		expect(march?.grossCents).toBe(15000);
		expect(march?.netCents).toBe(12000);
	});

	it("getRevenueByBucket scopes to the instructor", async () => {
		const a = await makeUser({ role: Role.INSTRUCTOR });
		const b = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const courseB = await makeCourse({
			instructorId: b.id,
			status: "published",
		});
		await makePayment({
			studentId: student.id,
			instructorId: b.id,
			courseId: courseB.id,
			amountCents: 10000,
			createdAt: new Date(2026, 2, 5),
		});

		const rows = await paymentRepository.getRevenueByBucket(
			a.id,
			new Date(2026, 0, 1),
			"month",
		);
		expect(rows).toHaveLength(0);
	});

	it("getRevenueGroupedByCourse returns courses ranked by gross, capped by limit", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const c1 = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const c2 = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: c1.id,
			amountCents: 3000,
			createdAt: new Date(2026, 2, 1),
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: c2.id,
			amountCents: 8000,
			createdAt: new Date(2026, 2, 2),
		});

		const rows = await paymentRepository.getRevenueGroupedByCourse(
			instructor.id,
			new Date(2026, 0, 1),
			5,
		);
		expect(
			rows.map((r) => ({ courseId: r.courseId, grossCents: r.grossCents })),
		).toEqual([
			{ courseId: c2.id, grossCents: 8000 },
			{ courseId: c1.id, grossCents: 3000 },
		]);
	});

	it("getRevenueByCourseIds sums succeeded, non-refunded payments per course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const c1 = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const c2 = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const c3 = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: c1.id,
			amountCents: 3000,
			status: "succeeded",
			refundedAt: null,
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: c1.id,
			amountCents: 2000,
			status: "succeeded",
			refundedAt: null,
		});
		// Refunded — should be excluded
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: c2.id,
			amountCents: 9000,
			status: "succeeded",
			refundedAt: new Date(),
		});

		const map = await paymentRepository.getRevenueByCourseIds([
			c1.id,
			c2.id,
			c3.id,
		]);

		expect(map.get(c1.id)).toBe(5000);
		expect(map.has(c2.id)).toBe(false); // refunded, excluded
		expect(map.has(c3.id)).toBe(false); // no qualifying payments
	});

	it("getRevenueByCourseIds returns an empty map for no ids", async () => {
		const map = await paymentRepository.getRevenueByCourseIds([]);
		expect(map.size).toBe(0);
	});
});

describe("PaymentRepository.findPurchasesByStudent — integration", () => {
	it("returns only succeeded+refunded for the student, newest first", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR, name: "Ada" });
		const student = await makeUser({ role: Role.STUDENT });
		const other = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Rust 101",
		});

		const base = {
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			currency: "usd",
			amountCents: 4999,
		};
		await testDb.payment.create({
			data: { ...base, status: "succeeded", createdAt: new Date("2026-01-01") },
		});
		await testDb.payment.create({
			data: { ...base, status: "refunded", createdAt: new Date("2026-02-01") },
		});
		await testDb.payment.create({ data: { ...base, status: "pending" } });
		await testDb.payment.create({ data: { ...base, status: "failed" } });
		await testDb.payment.create({
			data: { ...base, studentId: other.id, status: "succeeded" },
		});

		const rows = await paymentRepository.findPurchasesByStudent(student.id);

		expect(rows).toHaveLength(2);
		expect(rows[0]?.status).toBe("refunded"); // newest first
		expect(rows[1]?.status).toBe("succeeded");
		expect(rows[0]?.course.title).toBe("Rust 101");
		expect(rows[0]?.instructor.name).toBe("Ada");
	});

	it("findInvoiceData returns course title and student identity, or null", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({
			role: Role.STUDENT,
			name: "Bob",
			email: "bob@x.io",
		});
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Go",
		});
		const payment = await testDb.payment.create({
			data: {
				studentId: student.id,
				instructorId: instructor.id,
				courseId: course.id,
				currency: "usd",
				amountCents: 2000,
				status: "succeeded",
			},
		});

		const found = await paymentRepository.findInvoiceData(payment.id);
		expect(found?.course.title).toBe("Go");
		expect(found?.student.name).toBe("Bob");
		expect(found?.student.email).toBe("bob@x.io");

		expect(await paymentRepository.findInvoiceData("nope")).toBeNull();
	});
});
