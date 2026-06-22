import { verifyInvoiceToken } from "@/server/services/billing/auth";
import { InvoiceNotFoundError } from "@/server/services/billing/billing.errors";
import { billingService } from "@/server/services/billing/billing.service";

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ paymentId: string }> },
) {
	const { paymentId } = await params;
	const token = new URL(req.url).searchParams.get("token");

	if (!token) {
		return new Response("Unauthorized", { status: 401 });
	}

	try {
		const claims = await verifyInvoiceToken(token);
		if (claims.paymentId !== paymentId) {
			return new Response("Unauthorized", { status: 401 });
		}
	} catch {
		return new Response("Unauthorized", { status: 401 });
	}

	try {
		const buf = await billingService.renderInvoicePdf(paymentId);
		return new Response(new Uint8Array(buf), {
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="invoice-${paymentId}.pdf"`,
			},
		});
	} catch (e) {
		if (e instanceof InvoiceNotFoundError) {
			return new Response("Not found", { status: 404 });
		}
		throw e;
	}
}
