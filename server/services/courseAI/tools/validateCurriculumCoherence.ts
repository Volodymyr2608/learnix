import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "@/lib/env";
import { CourseAIToolError } from "@/server/services/courseAI/courseAI.errors";
import { logger } from "@/server/utils/logger";

const sectionSchema = z.object({
	title: z.string(),
	order: z.number().optional(),
	lessons: z
		.array(
			z.object({
				title: z.string(),
				durationMinutes: z.number().int().optional(),
			}),
		)
		.min(1),
});

const argsSchema = z.object({
	sections: z.array(sectionSchema).min(1),
	level: z.string(),
	objectives: z.array(z.string()).min(1),
});

const resultSchema = z.object({
	passes: z.boolean(),
	issues: z.array(z.string()),
});

export const validateCurriculumCoherenceTool = tool(
	async ({ sections, level, objectives }) => {
		try {
			const judge = new ChatOpenAI({
				model: "gpt-4o-mini",
				temperature: 0,
				apiKey: env.OPENAI_API_KEY,
			}).withStructuredOutput(resultSchema);

			const prompt =
				`You are an instructional-design reviewer. Judge whether the curriculum below covers all stated objectives and is appropriate for the level.

LEVEL: ${level}

OBJECTIVES:
${objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

CURRICULUM (JSON):
${JSON.stringify(sections, null, 2)}

Rules:
- "passes" is true ONLY if every objective is plausibly covered by at least one lesson AND the sequencing is appropriate for the level.
- Otherwise list specific issues.`.trim();

			const result = await judge.invoke([{ role: "user", content: prompt }]);
			return JSON.stringify(result);
		} catch (err) {
			logger.error(
				new CourseAIToolError(`validate_curriculum_coherence: ${String(err)}`),
			);
			return JSON.stringify({
				error: "tool failed; proceed without coherence check",
			});
		}
	},
	{
		name: "validate_curriculum_coherence",
		description:
			"Check whether the proposed curriculum covers all stated objectives and is appropriate for the course level. Returns { passes, issues[] }.",
		schema: argsSchema,
	},
);
