import { tool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { courseRepository } from "@/server/repositories/course.repository";
import { CourseAIToolError } from "@/server/services/courseAI/courseAI.errors";
import { logger } from "@/server/utils/logger";

export const fetchInstructorPriorCoursesTool = tool(
	async (_args, config: RunnableConfig | undefined) => {
		const instructorId = (
			config?.configurable as { instructorId?: string } | undefined
		)?.instructorId;

		if (!instructorId) {
			logger.error(
				new CourseAIToolError(
					"fetch_instructor_prior_courses: missing instructorId in RunnableConfig.configurable",
				),
			);
			return JSON.stringify({ error: "tool failed; missing instructor context" });
		}

		try {
			const courses = await courseRepository.findMany({
				where: { instructorId, deletedAt: null },
				select: {
					id: true,
					title: true,
					level: true,
					category: true,
					language: true,
				},
			});
			return JSON.stringify({ results: courses });
		} catch (err) {
			logger.error(
				new CourseAIToolError(
					`fetch_instructor_prior_courses: ${String(err)}`,
				),
			);
			return JSON.stringify({
				error: "tool failed; proceed without prior-course context",
			});
		}
	},
	{
		name: "fetch_instructor_prior_courses",
		description:
			"Fetch the current instructor's existing courses to preserve voice/style. Takes no arguments.",
		schema: z.object({}),
	},
);