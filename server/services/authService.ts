import { hashSync } from "@/lib/utils/hashSync";
import type { SignUpData } from "@/server/entities/user";
import { userRepository } from "@/server/repositories/userRepository";
// import {hashSync} from "@/lib/utils/hashSync";

export class AuthService {
	async signUp(
		data: SignUpData,
	): Promise<{ success: true } | { success: false; message: string }> {
		const { email, name, password } = data;
		const existing = await userRepository.findFirst({ email });

		if (existing) {
			return { success: false, message: "This email is already registered" };
		}

		await userRepository.createUser({
			email,
			name,
			hashedPassword: hashSync(password),
		});

		return { success: true };
	}
}

export const authService = new AuthService();
