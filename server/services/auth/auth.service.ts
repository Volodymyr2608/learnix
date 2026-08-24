import { auth } from "@/server/better-auth";
import type { UserSignUpDto } from "@/server/entities/user";
import { userRepository } from "@/server/repositories/user.repository";
import { AuthError } from "@/server/services/auth/auth.errors";

export class AuthService {
	async signUp(data: UserSignUpDto) {
		const { email, name, password } = data;
		const existing = await userRepository.findFirst({ where: { email } });

		if (existing) {
			throw new AuthError("This email is already registered", "CONFLICT");
		}

		const userData = await auth.api.signUpEmail({
			body: {
				name,
				email,
				password,
			},
		});

		return {
			success: true,
			message: "User created successfully",
			userId: userData.user.id,
		};
	}
}

export const authService = new AuthService();
