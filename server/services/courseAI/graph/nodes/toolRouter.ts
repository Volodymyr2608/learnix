import type { BaseMessage } from "@langchain/core/messages";
import {
	AIMessage,
	HumanMessage,
	SystemMessage,
} from "@langchain/core/messages";
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

export const toolRouter = withNodeErrors(
	"tool_router",
	async (state, config) => {
		const tools = toolsForState(state);

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0.4,
			apiKey: env.OPENAI_API_KEY,
		}).bindTools(tools);

		const basePrompt = buildSystemPrompt({
			step: state.currentStep,
			currentCourseData: state.content as Record<string, unknown>,
		});

		const toolGuidance = [
			"TOOLS AVAILABLE — use them proactively before composing your reply:",
			"- search_similar_courses: find published courses similar to this one. Use it to ground suggestions in real examples.",
			"- fetch_instructor_prior_courses: retrieve this instructor's past courses to match their style and avoid duplication.",
			"- lookup_category_taxonomy: confirm valid category values when uncertain.",
			state.currentStep === DraftStep.curriculum
				? "- validate_curriculum_coherence: verify that sections cover the stated objectives and fit the course level. Call this before finalising curriculum suggestions."
				: null,
			"",
			"Call tools BEFORE generating your response when they would make your answer more accurate or grounded. You may call multiple tools in sequence.",
		]
			.filter(Boolean)
			.join("\n");

		const systemPrompt = `${basePrompt}\n\n${toolGuidance}`;

		// Build messages: history + current user turn + any tool call/result pairs from prior loop iterations
		const messages: BaseMessage[] = [
			new SystemMessage(systemPrompt),
			...state.history.map((m) =>
				m.role === "user"
					? new HumanMessage(m.content)
					: new AIMessage(m.content),
			),
			new HumanMessage(state.userMessage),
			...(state.messages as BaseMessage[]),
		];

		const response = await model.invoke(messages, config);
		const toolCalls = (response.tool_calls ?? []).map((tc) => ({
			id: tc.id,
			name: tc.name,
			args: tc.args,
		}));

		// Append the AIMessage so ToolNode can find it, and so subsequent tool_router passes see prior results
		return { toolCalls, pendingToolCalls: toolCalls, messages: [response] };
	},
);
