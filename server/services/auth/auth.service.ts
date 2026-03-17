import { auth } from "@/server/better-auth";
import type { SignUpData } from "@/server/entities/user";
import { userRepository } from "@/server/repositories/user.repository";

export class AuthService {
	async signUp(
		data: SignUpData,
	): Promise<{ success: true } | { success: false; message: string }> {
		const { email, name, password } = data;
		const existing = await userRepository.findFirst({ where: { email } });

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
}

export const authService = new AuthService();
