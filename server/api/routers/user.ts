import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { signUpSchema } from "@/server/entities/user";
import { authService } from "@/server/services/auth/auth.service";
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
});
