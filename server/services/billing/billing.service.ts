import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { InvoiceDocument } from "@/app/_components/Invoice";
import type { StudentPurchase } from "@/server/entities/billing/purchase";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { InvoiceNotFoundError } from "./billing.errors";

class BillingService {
	async listPurchases(studentId: string): Promise<StudentPurchase[]> {
		const rows = await paymentRepository.findPurchasesByStudent(studentId);
		return rows.map((row) => ({
			paymentId: row.id,
			courseId: row.courseId,
			courseTitle: row.course.title,
			instructorName: row.instructor.name,
			amountCents: row.amountCents,
			currency: row.currency,
			status: row.status as "succeeded" | "refunded",
			purchasedAt: row.createdAt,
			refundedAt: row.refundedAt,
		}));
	}

	async renderInvoicePdf(paymentId: string): Promise<Buffer> {
		const payment = await paymentRepository.findInvoiceData(paymentId);
		if (!payment) throw new InvoiceNotFoundError();

		const element = createElement(InvoiceDocument, {
			paymentId: payment.id,
			studentName: payment.student.name,
			studentEmail: payment.student.email,
			courseTitle: payment.course.title,
			amountCents: payment.amountCents,
			currency: payment.currency,
			status: payment.status as "succeeded" | "refunded",
			purchasedAt: payment.createdAt,
		});

		return renderToBuffer(element as ReactElement<DocumentProps>);
	}
}

export const billingService = new BillingService();
