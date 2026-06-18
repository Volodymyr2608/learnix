import { createTRPCRouter, studentProcedure } from "@/server/api/trpc";
import { studentService } from "@/server/services/student/student.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const studentRouter = createTRPCRouter({
	getProgressStats: studentProcedure.query(async ({ ctx }) => {
		try {
			return await studentService.getProgressStats(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
	getDashboardStats: studentProcedure.query(async ({ ctx }) => {
		try {
			return await studentService.getDashboardStats(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
	getContinueLearning: studentProcedure.query(async ({ ctx }) => {
		try {
			return await studentService.getContinueLearning(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
});
