import { timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

const certificateSecret = () =>
	new TextEncoder().encode(env.CERTIFICATE_SECRET);

/**
 * Constant-time `Authorization: Bearer <secret>` check (H8). The length check short-circuits, which
 * leaks only the length; timingSafeEqual requires equal lengths anyway.
 */
export const bearerMatches = (req: Request, secret: string): boolean => {
	const expected = Buffer.from(`Bearer ${secret}`);
	const actual = Buffer.from(req.headers.get("authorization") ?? "");
	return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export function requireBearer(req: Request): void {
	if (!bearerMatches(req, env.N8N_API_TOKEN)) {
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
