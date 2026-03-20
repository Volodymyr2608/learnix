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
	role: true,
}).partial();

export type UserUpdateDto = z.infer<typeof UserUpdateDto>;

/**
 * Schema for sign-up validation with password confirmation
 */

const baseSignUpSchema = z.object({
	email: emailSchema,
	name: nameSchema,
	password: passwordSchema,
	confirmPassword: passwordSchema,
});

export const signUpSchema = baseSignUpSchema.refine(
	doesPasswordMatch,
	onPasswordMismatch,
);

export type SignUpData = z.infer<typeof signUpSchema>;

export const UserSignUpDto = baseSignUpSchema.pick({
	name: true,
	email: true,
	password: true,
});

export type UserSignUpDto = z.infer<typeof UserSignUpDto>;

export const signInSchema = baseSignUpSchema.pick({
	email: true,
	password: true,
});
export type SignInData = z.infer<typeof signInSchema>;
