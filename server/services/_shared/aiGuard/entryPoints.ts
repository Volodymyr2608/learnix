/**
 * Files that accept untrusted text and MUST call guardUserInput or
 * wrapUntrustedContent. Enforced by entryPoints.contract.test.ts.
 *
 * Adding a new AI surface without registering it here fails CI — that is the
 * point. Do not add a file to EXEMPT_MODEL_CALLERS to silence the test unless
 * its untrusted input is genuinely wrapped by its caller.
 */
export const GUARDED_ENTRY_POINTS: string[] = [
	"server/services/_shared/aiGuard/topicRelevance.ts",
	"server/services/courseAI/graph/nodes/chatResponse.ts",
	"server/services/courseAI/tools/validateCurriculumCoherence.ts",
	"server/services/learningPathAI/nodes/mergeAndExplain.node.ts",
	"server/services/learningPathAI/nodes/reflectAndCheck.node.ts",
];

/**
 * Model callers that receive already-wrapped content from their caller and so
 * need no wrapping of their own. Each entry is a claim that must stay true.
 */
export const EXEMPT_MODEL_CALLERS: string[] = [
	// courseAI graph nodes — operate on state populated via the guarded entry
	// point at app/api/chat/course/route.ts (guardUserInput runs before the
	// graph is entered).
	"server/services/courseAI/graph/nodes/classifyIntent.ts",
	"server/services/courseAI/graph/nodes/assessCompletion.ts",
	"server/services/courseAI/graph/nodes/extractStepData.ts",
	"server/services/courseAI/graph/nodes/confidenceScore.ts",
	"server/services/courseAI/graph/nodes/clarify.ts",
	"server/services/courseAI/graph/nodes/revisePriorField.ts",
	"server/services/courseAI/graph/nodes/toolRouter.ts",
	// consume the {content} variable wrapped by lessonInsightsAI.service.ts
	// before it reaches parallel.chain.ts and these three chains.
	"server/services/lessonInsightsAI/chains/summary.chain.ts",
	"server/services/lessonInsightsAI/chains/concepts.chain.ts",
	"server/services/lessonInsightsAI/chains/glossary.chain.ts",
	// receives lesson content wrapped by quizAI/tools/getLessonContent.tool.ts
	"server/services/quizAI/quizAI.agent.ts",
	// receives the user message guarded at app/api/chat/lesson/route.ts
	"server/services/lessonAI/lessonAI.agent.ts",
];
