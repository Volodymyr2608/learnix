import { END, START, StateGraph } from "@langchain/langgraph";
import { PathStateSchema } from "./learningPathAI.state";
import {
	decideStrategy,
	identifyWeakSignals,
	loadStudentSignal,
	mergeAndExplain,
	proposeNewLessons,
	proposeReviews,
	reflectAndCheck,
	setSkipLLMIfEmpty,
} from "./nodes";

export function buildLearningPathGraph() {
	return new StateGraph(PathStateSchema)
		.addNode("loadStudentSignal", loadStudentSignal)
		.addNode("identifyWeakSignals", identifyWeakSignals)
		.addNode("setSkipLLM", setSkipLLMIfEmpty)
		.addNode("proposeReviews", proposeReviews)
		.addNode("proposeNewLessons", proposeNewLessons)
		.addNode("mergeAndExplain", mergeAndExplain)
		.addNode("reflectAndCheck", reflectAndCheck)
		.addEdge(START, "loadStudentSignal")
		.addEdge("loadStudentSignal", "identifyWeakSignals")
		.addConditionalEdges("identifyWeakSignals", decideStrategy, {
			hasWeak: "proposeReviews",
			ready: "proposeNewLessons",
			empty: "setSkipLLM",
		})
		.addEdge("setSkipLLM", "proposeNewLessons")
		.addEdge("proposeReviews", "proposeNewLessons")
		.addEdge("proposeNewLessons", "mergeAndExplain")
		.addEdge("mergeAndExplain", "reflectAndCheck")
		.addConditionalEdges("reflectAndCheck", (s) =>
			s.reflectionFeedback && s.reflectionAttempt < 2 ? "mergeAndExplain" : END,
		)
		.compile();
}
