import type { PasswordRepetition } from "@/server/entities/base";

export const doesPasswordMatch = ({
	password,
	confirmPassword,
}: PasswordRepetition): boolean => password === confirmPassword;

export const onPasswordMismatch = {
	message: "Passwords don't match",
	path: ["confirmPassword"],
};
