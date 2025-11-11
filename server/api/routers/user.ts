import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { signUpSchema } from "@/server/entities/user";
import { authService } from "@/server/services/authService";

const userRouter = createTRPCRouter({
	signUp: publicProcedure
		.input(signUpSchema)
		.mutation(async ({ input }) => authService.signUp(input)),
});
