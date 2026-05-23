import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

const secret = () => new TextEncoder().encode(env.N8N_API_TOKEN);

export async function signUnsubscribeToken(userId: string): Promise<string> {
	return new SignJWT({ userId, kind: "unsub" })
		.setProtectedHeader({ alg: "HS256" })
		.sign(secret());
}

export async function verifyUnsubscribeToken(
	token: string,
): Promise<{ userId: string }> {
	const { payload } = await jwtVerify(token, secret());
	if (payload.kind !== "unsub") throw new Error("Invalid token kind");
	return { userId: payload.userId as string };
}
