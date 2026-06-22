import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

const invoiceSecret = () => new TextEncoder().encode(env.INVOICE_SECRET);

export async function signInvoiceToken(paymentId: string): Promise<string> {
	return new SignJWT({ paymentId })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime("30d")
		.sign(invoiceSecret());
}

export async function verifyInvoiceToken(
	token: string,
): Promise<{ paymentId: string }> {
	const { payload } = await jwtVerify(token, invoiceSecret());
	return payload as { paymentId: string };
}
