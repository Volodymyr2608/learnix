import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import { traced } from "@/server/services/_shared/tracing";
import { insightsChain } from "./chains/parallel.chain";
import {
	LessonHasNoContentError,
	NotInstructorError,
} from "./lessonInsightsAI.errors";

const MODEL = "gpt-4o-mini";

class LessonInsightsAIService {
	async generateForLesson(lessonId: string, instructorId: string) {
		const coreGenerate = traced(
			"lessonInsightsAI.generateForLesson",
			async (lId: string) => {
				const lesson = await lessonRepository.findFirst({
					where: {
						id: lId,
						deletedAt: null,
						section: { course: { instructorId } },
					},
					select: { id: true, content: true },
				});

				if (!lesson) throw new NotInstructorError(lId);
				if (!lesson.content?.trim()) throw new LessonHasNoContentError(lId);

				const contentHash = createHash("sha256")
					.update(lesson.content)
					.digest("hex");

				const existing = await lessonInsightsRepository.findByLessonId(lId);
				if (existing?.contentHash === contentHash) return existing;

				const result = await insightsChain.invoke({
					content: wrapUntrustedContent(lesson.content, "lesson_content"),
				});

				return lessonInsightsRepository.upsertByLessonId(lId, {
					summary: result.summary.summary,
					concepts: result.concepts
						.concepts as unknown as Prisma.InputJsonValue,
					glossary: result.glossary
						.glossary as unknown as Prisma.InputJsonValue,
					model: MODEL,
					contentHash,
				});
			},
			{ feature: "summary", userId: instructorId, model: MODEL },
		);

		return coreGenerate(lessonId);
	}

	async getForLesson(lessonId: string, userId: string) {
		const lesson = await lessonRepository.findFirst({
			where: {
				id: lessonId,
				deletedAt: null,
				OR: [
					{ section: { course: { instructorId: userId } } },
					{
						section: {
							course: {
								enrollments: {
									some: { studentId: userId, status: { not: "cancelled" } },
								},
							},
						},
					},
				],
			},
			select: { id: true },
		});

		if (!lesson) return null;

		return lessonInsightsRepository.findByLessonId(lessonId);
	}
}

export const lessonInsightsAIService = new LessonInsightsAIService();
