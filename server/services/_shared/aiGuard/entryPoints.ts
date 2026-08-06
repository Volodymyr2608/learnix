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
	"server/services/courseAI/graph/nodes/clarify.ts",
	"server/services/courseAI/graph/nodes/revisePriorField.ts",
	"server/services/courseAI/graph/nodes/toolRouter.ts",
	// consume the {content} variable wrapped by lessonInsightsAI.service.ts
	// before it reaches parallel.chain.ts and these three chains.
	"server/services/lessonInsightsAI/chains/summary.chain.ts",
	"server/services/lessonInsightsAI/chains/concepts.chain.ts",
	"server/services/lessonInsightsAI/chains/glossary.chain.ts",
];
