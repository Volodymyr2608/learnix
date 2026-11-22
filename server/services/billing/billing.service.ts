import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { InvoiceDocument } from "@/app/_components/Invoice";
import type { StudentPurchase } from "@/server/entities/billing/purchase";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { isDisputeBlocking } from "@/server/services/refund/refundFacts";
import { isStudentRefundEnabled } from "@/server/services/refund/refundFlag";
import { purchaseRefundRowState } from "@/server/services/refund/refundView";
import { InvoiceNotFoundError } from "./billing.errors";

class BillingService {
	async listPurchases(
		studentId: string,
		now: Date = new Date(),
	): Promise<StudentPurchase[]> {
		const rows = await paymentRepository.findPurchasesByStudent(studentId);
		const refundFacts = await this.refundFactsFor(studentId, rows);
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
			refund: refundFacts
				? purchaseRefundRowState(
						{
							paidAt: row.paidAt,
							paymentRefunded: row.status === "refunded",
							hasCertificate: refundFacts.certified.has(row.courseId),
							hasEarlierCountingRefund: refundFacts.counting.has(row.courseId),
							hasOpenDispute: isDisputeBlocking(row.disputeState),
							request: row.refundRequest,
						},
						now,
					)
				: null,
		}));
	}

	/** U7: two batched reads for the whole list; nothing while the student flag is off. */
	private async refundFactsFor(
		studentId: string,
		rows: { courseId: string }[],
	): Promise<{ certified: Set<string>; counting: Set<string> } | null> {
		if (!isStudentRefundEnabled()) return null;
		const courseIds = [...new Set(rows.map((r) => r.courseId))];
		const [certified, counting] = await Promise.all([
			refundRequestRepository.findCertifiedCourseIds(studentId, courseIds),
			refundRequestRepository.findCountingRefundCourseIds(studentId, courseIds),
		]);
		return { certified, counting };
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
