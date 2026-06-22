import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { InvoiceNotFoundError } from "@/server/services/billing/billing.errors";
import { billingService } from "@/server/services/billing/billing.service";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";

describe("BillingService — integration", () => {
	it("listPurchases maps rows to StudentPurchase DTOs", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR, name: "Ada" });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Rust",
		});
		await testDb.payment.create({
			data: {
				studentId: student.id,
				instructorId: instructor.id,
				courseId: course.id,
				currency: "usd",
				amountCents: 4999,
				status: "succeeded",
			},
		});

		const out = await billingService.listPurchases(student.id);

		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			courseTitle: "Rust",
			instructorName: "Ada",
			amountCents: 4999,
			currency: "usd",
			status: "succeeded",
		});
		expect(out[0]?.paymentId).toBeTruthy();
	});

	it("renderInvoicePdf returns a PDF buffer for a real payment", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({
			role: Role.STUDENT,
			name: "Bob",
			email: "b@x.io",
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

		const buf = await billingService.renderInvoicePdf(payment.id);
		expect(buf).toBeInstanceOf(Buffer);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
	});

	it("renderInvoicePdf throws InvoiceNotFoundError for a missing payment", async () => {
		await expect(
			billingService.renderInvoicePdf("missing"),
		).rejects.toBeInstanceOf(InvoiceNotFoundError);
	});
});
