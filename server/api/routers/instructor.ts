import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { instructorSchema } from "@/server/entities/instructor";
import { instructorService } from "@/server/services/instructor/instructor.service";

export const instructorRouter = createTRPCRouter({
	create: publicProcedure
		.input(instructorSchema)
		.mutation(async ({ input }) => {
			console.log(input);
			try {
				return await instructorService.createInstructor(input);
			} catch (error: unknown) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					// @ts-expect-error
					message: error.message,
				});
			}
		}),
});
