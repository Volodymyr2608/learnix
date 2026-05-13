import { SignJWT } from "jose";
import { env } from "@/lib/env";

const secret = () => new TextEncoder().encode(env.N8N_API_TOKEN);

export async function signUnsubscribeToken(userId: string): Promise<string> {
	return new SignJWT({ userId, kind: "unsub" })
		.setProtectedHeader({ alg: "HS256" })
		.sign(secret());
}