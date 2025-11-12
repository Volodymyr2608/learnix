import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { signUpSchema } from "@/server/entities/user";
import { authService } from "@/server/services/authService";
import {TRPCError} from "@trpc/server";

export const userRouter = createTRPCRouter({
	signUp: publicProcedure
		.input(signUpSchema)
		.mutation(async ({ input }) => {
      try {
        return await authService.signUp(input);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error.message,
        });
      }
    }),
});
