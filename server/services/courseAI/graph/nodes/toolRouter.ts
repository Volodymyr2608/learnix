import type { StructuredToolInterface } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { DraftStep } from "@/generated/prisma";
import { env } from "@/lib/env";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { buildSystemPrompt } from "@/server/services/courseAI/prompts/systemPrompt";
import { fetchInstructorPriorCoursesTool } from "@/server/services/courseAI/tools/fetchInstructorPriorCourses";
import { lookupCategoryTaxonomyTool } from "@/server/services/courseAI/tools/lookupCategoryTaxonomy";
import { searchSimilarCoursesTool } from "@/server/services/courseAI/tools/searchSimilarCourses";
import { validateCurriculumCoherenceTool } from "@/server/services/courseAI/tools/validateCurriculumCoherence";

export const toolsForState = (state: CourseBuilderStateT) => {
	const base: StructuredToolInterface[] = [
		searchSimilarCoursesTool,
		fetchInstructorPriorCoursesTool,
		lookupCategoryTaxonomyTool,
	];
	if (state.currentStep === DraftStep.curriculum) {
		base.push(validateCurriculumCoherenceTool);
	}
	return base;
};

export const toolRouter = withNodeErrors("tool_router", async (state) => {
	const tools = toolsForState(state);

	const model = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0.4,
		apiKey: env.OPENAI_API_KEY,
	}).bindTools(tools);

	const systemPrompt = buildSystemPrompt({
		step: state.currentStep,
		currentCourseData: state.content as Record<string, unknown>,
	});

	const messages = [
		{ role: "system" as const, content: systemPrompt },
		...state.history.map((m) => ({ role: m.role, content: m.content })),
		{ role: "user" as const, content: state.userMessage },
	];

	const response = await model.invoke(messages);
	const toolCalls = (response.tool_calls ?? []).map((tc) => ({
		id: tc.id,
		name: tc.name,
		args: tc.args,
	}));

	return { toolCalls, pendingToolCalls: toolCalls };
});
