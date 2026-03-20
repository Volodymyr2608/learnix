import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { signUpSchema } from "@/server/entities/user";
import { authService } from "@/server/services/auth/auth.service";

export const userRouter = createTRPCRouter({
	signUp: publicProcedure.input(signUpSchema).mutation(async ({ input }) => {
		try {
			return await authService.signUp({
				email: input.email,
				name: input.name,
				password: input.password,
			});
		} catch (error: unknown) {
			if (error instanceof Error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error.message,
				});
			}

			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Unknown error",
			});
		}
	}),
});
