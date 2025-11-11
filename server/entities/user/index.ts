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
	passwordHash: true,
	email: true,
});
export type UserCreateDto = z.infer<typeof UserCreateDto>;

export const UserUpdateDto = UserDto.pick({
	passwordHash: true,
	emailVerified: true,
	image: true,
}).partial();

export type UserUpdateDto = z.infer<typeof UserUpdateDto>;

/**
 * Schema for sign-up validation with password confirmation
 */

export const signUpSchema = z
	.object({
		email: emailSchema,
		name: nameSchema,
		password: passwordSchema,
		confirmPassword: passwordSchema,
	})
	.refine(doesPasswordMatch, onPasswordMismatch);

export type SignUpData = z.infer<typeof signUpSchema>;
