// server/services/courseAI/graph/graph.ts
import { END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { fetchInstructorPriorCoursesTool } from "@/server/services/courseAI/tools/fetchInstructorPriorCourses";
import { lookupCategoryTaxonomyTool } from "@/server/services/courseAI/tools/lookupCategoryTaxonomy";
import { searchSimilarCoursesTool } from "@/server/services/courseAI/tools/searchSimilarCourses";
import { validateCurriculumCoherenceTool } from "@/server/services/courseAI/tools/validateCurriculumCoherence";
import { assessCompletion } from "./nodes/assessCompletion";
import { chatResponse } from "./nodes/chatResponse";
import { clarify } from "./nodes/clarify";
import { classifyIntent } from "./nodes/classifyIntent";
import { confidenceScore } from "./nodes/confidenceScore";
import { extractStepData } from "./nodes/extractStepData";
import { persistAndEmit } from "./nodes/persistAndEmit";
import { revisePriorField } from "./nodes/revisePriorField";
import { toolRouter } from "./nodes/toolRouter";
import { validate } from "./nodes/validate";
import { CourseBuilderState, type CourseBuilderStateT } from "./state";

const allTools = [
	searchSimilarCoursesTool,
	fetchInstructorPriorCoursesTool,
	lookupCategoryTaxonomyTool,
	validateCurriculumCoherenceTool,
];

// --- route predicates ---

const routeByMode = (s: CourseBuilderStateT) =>
	s.mode === "finalize" ? "finalize" : "chat";

const routeByIntent = (s: CourseBuilderStateT) => {
	if (s.intent === "revise") return "revise";
	if (s.intent === "clarify") return "clarify";
	return "continue";
};

// Use pendingToolCalls (not toolCalls) — toolCalls accumulates, pendingToolCalls is reset each pass
const routeAfterToolRouter = (s: CourseBuilderStateT) =>
	s.pendingToolCalls.length > 0 ? "use_tool" : "answer";

const routeAfterAssess = (s: CourseBuilderStateT) => {
	if (s.assessReady) return "ready";
	if (s.assessClarify) return "ask";
	return "not_ready";
};

const routeAfterValidate = (s: CourseBuilderStateT) =>
	s.validationErrors === null ? "pass" : "fail";

const routeAfterConfidence = (s: CourseBuilderStateT) =>
	s.mode === "finalize" || s.shouldAutoAdvance ? "persist" : "hold";

// --- builder ---

export const courseBuilderGraph = new StateGraph(CourseBuilderState)
	.addNode("classify_intent", classifyIntent)
	.addNode("revise_prior_field", revisePriorField)
	.addNode("tool_router", toolRouter)
	.addNode("tool_node", new ToolNode(allTools))
	.addNode("chat_response", chatResponse)
	.addNode("assess_completion", assessCompletion)
	.addNode("extract_step_data", extractStepData)
	.addNode("validate", validate)
	.addNode("confidence_score", confidenceScore)
	.addNode("clarify", clarify)
	.addNode("persist_and_emit", persistAndEmit)
	.addConditionalEdges(START, routeByMode, {
		chat: "classify_intent",
		finalize: "extract_step_data",
	})
	.addConditionalEdges("classify_intent", routeByIntent, {
		revise: "revise_prior_field",
		continue: "tool_router",
		clarify: "chat_response",
	})
	.addConditionalEdges("tool_router", routeAfterToolRouter, {
		use_tool: "tool_node",
		answer: "chat_response",
	})
	.addEdge("tool_node", "tool_router")
	.addEdge("chat_response", "assess_completion")
	.addEdge("revise_prior_field", "chat_response")
	.addConditionalEdges("assess_completion", routeAfterAssess, {
		ready: "extract_step_data",
		ask: "clarify",
		not_ready: END,
	})
	.addEdge("extract_step_data", "validate")
	.addConditionalEdges("validate", routeAfterValidate, {
		pass: "confidence_score",
		fail: "clarify",
	})
	.addConditionalEdges("confidence_score", routeAfterConfidence, {
		persist: "persist_and_emit",
		hold: END,
	})
	.addEdge("clarify", END)
	.addEdge("persist_and_emit", END)
	.compile();
