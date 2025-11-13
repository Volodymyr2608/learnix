import { headers } from "next/headers";
import { auth } from "@/server/better-auth";
import type { SignInData, SignUpData } from "@/server/entities/user";
import { userRepository } from "@/server/repositories/userRepository";

export class AuthService {
	async signUp(
		data: SignUpData,
	): Promise<{ success: true } | { success: false; message: string }> {
		const { email, name, password } = data;
		const existing = await userRepository.findFirst({ email });

		if (existing) {
			return { success: false, message: "This email is already registered" };
		}

		await auth.api.signUpEmail({
			body: {
				name,
				email,
				password,
			},
		});

		return { success: true };
	}

	async signIn(
		data: SignInData,
	): Promise<{ success: true } | { success: false; message: string }> {
		await auth.api.signInEmail({
			body: data,
			headers: await headers(),
		});

		return { success: true };
	}
}

export const authService = new AuthService();
