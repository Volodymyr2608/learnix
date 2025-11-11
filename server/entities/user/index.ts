import { z } from "zod";
import { UserSchema } from "@/prisma/zod";
import {
	emailSchema,
	nameSchema,
	passwordRepetitionSchema,
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
	.object({ email: emailSchema })
	.extend({ name: nameSchema })
	.extend(passwordRepetitionSchema);

export type SignUpData = z.infer<typeof signUpSchema>;
