import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { instructorSchema } from "@/server/entities/instructor";
import { instructorService } from "@/server/services/instructor/instructor.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const instructorRouter = createTRPCRouter({
	create: publicProcedure
		.input(instructorSchema)
		.mutation(async ({ input }) => {
			try {
				return await instructorService.createInstructor(input);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
