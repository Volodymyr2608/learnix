import {
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import {
	EmailPreferencesSchema,
	ProfileUpdateSchema,
	signUpSchema,
} from "@/server/entities/user";
import { authService } from "@/server/services/auth/auth.service";
import { userService } from "@/server/services/user/user.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const userRouter = createTRPCRouter({
	signUp: publicProcedure.input(signUpSchema).mutation(async ({ input }) => {
		try {
			return await authService.signUp({
				email: input.email,
				name: input.name,
				password: input.password,
			});
		} catch (error) {
			handleServiceError(error);
		}
	}),

	updateProfile: protectedProcedure
		.input(ProfileUpdateSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await userService.updateUser(ctx.session.user.id, {
					name: input.name,
					...(input.image !== undefined && { image: input.image }),
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),

	updateEmailPreferences: protectedProcedure
		.input(EmailPreferencesSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await userService.updateUser(ctx.session.user.id, {
					emailNotificationsEnabled: input.emailNotificationsEnabled,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
