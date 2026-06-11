import { z } from "zod";
import {
	doesPasswordMatch,
	onPasswordMismatch,
} from "@/lib/utils/doesPasswordMatch";
import { UserSchema } from "@/prisma/zod";
import {
	emailSchema,
	nameSchema,
	passwordSchema,
} from "@/server/entities/base";

export const UserDto = UserSchema;

export const UserCreateDto = UserSchema.pick({
	name: true,
	email: true,
	role: true,
});
export type UserCreateDto = z.infer<typeof UserCreateDto>;

export const UserCreatePayload = UserSchema.pick({
	name: true,
	email: true,
}).extend({
	hashedPassword: z.string(),
});
export type UserCreatePayload = z.infer<typeof UserCreatePayload>;

export const UserUpdateDto = UserDto.pick({
	name: true,
	email: true,
	emailVerified: true,
	image: true,
	emailNotificationsEnabled: true,
}).partial();

export type UserUpdateDto = z.infer<typeof UserUpdateDto>;

/**
 * Schema for sign-up validation with password confirmation
 */

export const signUpSchema = z.object({
	email: emailSchema,
	name: nameSchema,
	password: passwordSchema,
});
export type SignUpData = z.infer<typeof signUpSchema>;

export const UserSignUpDto = signUpSchema;
export type UserSignUpDto = z.infer<typeof UserSignUpDto>;

export const signInSchema = z.object({
	email: emailSchema,
	password: passwordSchema,
});
export type SignInData = z.infer<typeof signInSchema>;

export const ProfileUpdateSchema = z.object({
	name: nameSchema,
	image: z.string().url().nullable(),
});
export type ProfileUpdateData = z.infer<typeof ProfileUpdateSchema>;

export const EmailPreferencesSchema = z.object({
	emailNotificationsEnabled: z.boolean(),
});
export type EmailPreferencesData = z.infer<typeof EmailPreferencesSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordData = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
	.object({ newPassword: passwordSchema, confirmPassword: passwordSchema })
	.refine(
		({ newPassword, confirmPassword }) =>
			doesPasswordMatch({ password: newPassword, confirmPassword }),
		{ ...onPasswordMismatch, path: ["confirmPassword"] },
	);
export type ResetPasswordData = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
	currentPassword: passwordSchema,
	newPassword: passwordSchema,
});
export type ChangePasswordData = z.infer<typeof changePasswordSchema>;
