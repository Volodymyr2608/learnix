import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { notificationService } from "@/server/services/notifications/notification.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const notificationsRouter = createTRPCRouter({
	emitTest: protectedProcedure
		.input(
			z.object({
				type: z.enum(["certificate.earned", "progress.near_completion"]),
				enrollmentId: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			if (env.NODE_ENV !== "development") {
				throw new TRPCError({ code: "FORBIDDEN" });
			}

			if (input.type === "certificate.earned") {
				await notificationService.fireCertificateEarned(input.enrollmentId);
				return { fired: true };
			}

			const enr = await enrollmentRepository.findFirst({
				where: { id: input.enrollmentId },
				include: {
					course: {
						include: {
							sections: {
								where: { deletedAt: null },
								include: {
									lessons: {
										where: { deletedAt: null },
										select: { id: true, title: true },
									},
								},
							},
						},
					},
				},
			});
			if (!enr) throw new TRPCError({ code: "NOT_FOUND" });

			const allLessons = enr.course.sections.flatMap((s) => s.lessons);
			const totalLessons = allLessons.length;
			const nextLesson = allLessons[0];

			await notificationService.fireProgressNearCompletion(
				enr.studentId,
				enr.courseId,
				{
					completedLessons: totalLessons > 2 ? totalLessons - 2 : 0,
					totalLessons,
					lessonsRemaining: 2,
					nextLessonId: nextLesson?.id ?? null,
					nextLessonTitle: nextLesson?.title ?? "",
				},
			);
			return { fired: true };
		}),
});
