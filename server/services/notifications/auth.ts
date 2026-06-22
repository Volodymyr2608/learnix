import { timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

const certificateSecret = () =>
	new TextEncoder().encode(env.CERTIFICATE_SECRET);

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
