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
import { outputBoundary } from "./nodes/outputBoundary";
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

/**
 * Purpose: entry fork — a finalize request skips the conversation and extracts directly.
 * Reads: mode.
 * Writes: nothing — predicates never write state.
 * Fails: cannot fail; any mode other than "finalize" falls through to "chat".
 */
const routeByMode = (s: CourseBuilderStateT) =>
	s.mode === "finalize" ? "finalize" : "chat";

/**
 * Purpose: routes a classified turn to revision, clarification, or the tool loop.
 * Reads: intent.
 * Writes: nothing.
 * Fails: cannot fail; a null intent falls through to "continue".
 */
const routeByIntent = (s: CourseBuilderStateT) => {
	if (s.intent === "revise") return "revise";
	if (s.intent === "clarify") return "clarify";
	return "continue";
};

/**
 * Purpose: decides whether another tool call is pending or the model can answer.
 * Reads: pendingToolCalls — deliberately not toolCalls, which accumulates across passes and would
 * loop forever.
 * Writes: nothing.
 * Fails: cannot fail.
 */
const routeAfterToolRouter = (s: CourseBuilderStateT) =>
	s.pendingToolCalls.length > 0 ? "use_tool" : "answer";

/**
 * Purpose: routes on step readiness — extract, ask a clarifying question, or end the turn.
 * Reads: assessReady, assessClarify.
 * Writes: nothing.
 * Fails: cannot fail.
 */
const routeAfterAssess = (s: CourseBuilderStateT) => {
	if (s.assessReady) return "ready";
	if (s.assessClarify) return "ask";
	return "not_ready";
};

/**
 * Purpose: routes on validation outcome.
 * Reads: validationErrors.
 * Writes: nothing.
 * Fails: cannot fail. "fail" targets clarify, not END — the instructor is asked for the missing
 * detail and nothing is persisted.
 */
const routeAfterValidate = (s: CourseBuilderStateT) =>
	s.validationErrors === null ? "pass" : "fail";

/**
 * Purpose: decides whether the step commits now or waits for the instructor's Accept.
 * Reads: mode, shouldAutoAdvance.
 * Writes: nothing.
 * Fails: cannot fail.
 */
const routeAfterConfidence = (s: CourseBuilderStateT) =>
	s.mode === "finalize" || s.shouldAutoAdvance ? "persist" : "hold";

/**
 * Purpose: sends a turn whose reply failed the output boundary straight to END,
 * so no later node commits a step or extracts data from it.
 * Reads: outputRejected.
 * Writes: nothing.
 * Fails: cannot fail.
 */
const routeAfterOutputBoundary = (s: CourseBuilderStateT) =>
	s.outputRejected ? "rejected" : "assess";

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
	// Two registrations of one implementation: chat_response needs a fork,
	// clarify's successor is END either way.
	.addNode("output_boundary", outputBoundary)
	.addNode("output_boundary_clarify", outputBoundary)
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
	.addEdge("chat_response", "output_boundary")
	.addConditionalEdges("output_boundary", routeAfterOutputBoundary, {
		rejected: END,
		assess: "assess_completion",
	})
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
	.addEdge("clarify", "output_boundary_clarify")
	.addEdge("output_boundary_clarify", END)
	.addEdge("persist_and_emit", END)
	.compile();
