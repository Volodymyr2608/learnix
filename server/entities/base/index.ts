import { z } from "zod";

/**
 * Base schemas for reusable validation rules
 */
export const emailSchema = z.email("Please enter a valid email address");
export const passwordSchema = z
	.string()
	.min(6, "Password must be at least 6 characters");
export const nameSchema = z
	.string()
	.min(2, "Name must be at least 2 characters");

export const passwordRepetitionSchema = z.object({
	password: passwordSchema,
	confirmPassword: passwordSchema,
});
export type PasswordRepetition = z.infer<typeof passwordRepetitionSchema>;

/**
 * Additional helper functions for validation
 */

export const validatePassword = (password: string): boolean => {
	return passwordSchema.safeParse(password).success;
};

export const validateEmail = (email: string): boolean => {
	return emailSchema.safeParse(email).success;
};
