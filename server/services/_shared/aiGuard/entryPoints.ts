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
	// The streamed prompt text moved out of the two nodes so its variants can be
	// assembled and pinned (promptVariants.ts); the wrapping moved with it, so
	// the claim now belongs to these two files as well as to the nodes.
	"server/services/courseAI/prompts/chatResponsePrompts.ts",
	"server/services/courseAI/prompts/clarifyPrompts.ts",
	// The other two prompt builders. Registered because they interpolate course
	// content too: extractStepDataPrompt did so unwrapped while the trust list
	// asserted its body was scanned, which it was not.
	"server/services/courseAI/prompts/extractStepDataPrompt.ts",
	"server/services/courseAI/prompts/systemPrompt.ts",
	"server/services/courseAI/tools/validateCurriculumCoherence.ts",
	"server/services/learningPathAI/nodes/mergeAndExplain.node.ts",
	"server/services/learningPathAI/nodes/reflectAndCheck.node.ts",
	// lessonAI: the agent wraps the instructor-authored titles and concept names
	// it embeds in its own system prompt; the two RAG tools wrap what they return.
	"server/services/lessonAI/lessonAI.agent.ts",
	"server/services/lessonAI/tools/retrieveLessonContext.tool.ts",
	"server/services/lessonAI/tools/searchAcrossCourse.tool.ts",
	// get_student_progress returns completed-lesson titles — instructor free text.
	"server/services/lessonAI/tools/getStudentProgress.tool.ts",
	// quizAI: both tools wrap what they read, and the agent wraps `level`, which
	// is z.string() rather than an enum and so is instructor free text too.
	"server/services/quizAI/quizAI.agent.ts",
	"server/services/quizAI/tools/getLessonContent.tool.ts",
	"server/services/quizAI/tools/getExistingQuizzes.tool.ts",
	// courseAI tools returning course copy — searchSimilarCourses reads *other*
	// instructors' titles and subtitles, the widest untrusted surface here.
	"server/services/courseAI/tools/searchSimilarCourses.ts",
	"server/services/courseAI/tools/fetchInstructorPriorCourses.ts",
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
	// chat_response and clarify: the instructor's own turn is guarded at
	// app/api/chat/course/route.ts, and the prompt text they stream — with its
	// wrapping — now lives in courseAI/prompts/{chatResponse,clarify}Prompts.ts,
	// which are registered above. History reaches these two as chat messages
	// carrying their own role, never interpolated into an instruction.
	"server/services/courseAI/graph/nodes/chatResponse.ts",
	"server/services/courseAI/graph/nodes/clarify.ts",
	"server/services/courseAI/graph/nodes/revisePriorField.ts",
	"server/services/courseAI/graph/nodes/toolRouter.ts",
	// consume the {content} variable wrapped by lessonInsightsAI.service.ts
	// before it reaches parallel.chain.ts and these three chains.
	"server/services/lessonInsightsAI/chains/summary.chain.ts",
	"server/services/lessonInsightsAI/chains/concepts.chain.ts",
	"server/services/lessonInsightsAI/chains/glossary.chain.ts",
];
