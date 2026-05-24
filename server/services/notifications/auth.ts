import { createHmac, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

const certificateSecret = () =>
	new TextEncoder().encode(env.CERTIFICATE_SECRET);

export function signHmac(body: string): string {
	return (
		"sha256=" +
		createHmac("sha256", env.N8N_WEBHOOK_SECRET).update(body).digest("hex")
	);
}

export function verifyHmac(body: string, header: string | null): boolean {
	if (!header) return false;
	const expected = signHmac(body);
	const a = Buffer.from(expected);
	const b = Buffer.from(header);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

export function requireBearer(req: Request): void {
	const h = req.headers.get("authorization") ?? "";
	const expected = Buffer.from(`Bearer ${env.N8N_API_TOKEN}`);
	const actual = Buffer.from(h);
	const valid =
		expected.length === actual.length && timingSafeEqual(expected, actual);
	if (!valid) {
		throw new Response("Unauthorized", { status: 401 });
	}
}

export async function signCertificateToken(
	enrollmentId: string,
): Promise<string> {
	return new SignJWT({ enrollmentId })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime("30d")
		.sign(certificateSecret());
}

export async function verifyCertificateToken(
	token: string,
): Promise<{ enrollmentId: string }> {
	const { payload } = await jwtVerify(token, certificateSecret());
	return payload as { enrollmentId: string };
}
