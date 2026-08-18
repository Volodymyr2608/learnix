import type { AiFeature } from "@/server/services/_shared/aiGuard/types";

/**
 * What each AI surface actually has in front of it, layer by layer. The point of
 * declaring it is that `aiSurfaces.contract.test.ts` re-derives every claim from
 * the source: a surface that stops running a limiter, or a new service that
 * constructs a model and never appears here, fails CI rather than quietly
 * reading as covered.
 *
 * Written per RULE for the output boundary, not as one "applied" value. A single
 * value would make quizAI's L5 read like the tutor's while `off_origin_link`
 * guards a rendering channel quizAI does not have — the three structured
 * surfaces render plain React text nodes, not markdown, so that rule is `n/a`
 * there and saying so is the difference between coverage and the appearance of
 * it.
 */
export type RuleStatus =
	| { status: "applied" }
	| { status: "n/a"; reason: string }
	| { status: "applied_with_exception"; reason: string }
	// Specified and planned, not yet in the code. Present so the matrix can be
	// honest mid-feature: a control that is coming is not a control that is
	// there, and "applied" must never be aspirational.
	| { status: "pending"; reason: string };

export type SurfaceConformance = {
	feature: AiFeature;
	/** Files that construct a ChatOpenAI for this surface. */
	modelCallers: string[];
	/** tRPC procedures that reach a model. Empty is a claim, not an omission. */
	trpcProcedures: string[];
	/** Raw route handlers that reach a model. */
	rawRoutes: string[];
	/** L1/L2 — input guard. */
	inputGuard: RuleStatus;
	/** L3 — untrusted-content wrapping. */
	wrapping: RuleStatus;
	/** L5 — the shared output boundary, declared per rule. */
	outputBoundary: {
		system_prompt_echo: RuleStatus;
		untrusted_data_echo: RuleStatus;
		off_origin_link: RuleStatus;
	};
	/** L6 — render policy. */
	renderPolicy: RuleStatus;
	/** L7 — resource boundary. */
	resourceLimits: RuleStatus;
	/** Anything the layers deliberately do not cover on this surface. */
	exclusions: string[];
};

const APPLIED: RuleStatus = { status: "applied" };

/**
 * Model calls that belong to a defence layer rather than to a surface: the L2
 * topic-relevance judge runs inside guardUserInput, on behalf of whichever
 * surface called it. Declared here so the completeness scan can tell "shared
 * layer" from "undeclared surface" instead of treating both as the same gap.
 */
export const SHARED_MODEL_CALLERS: string[] = [
	"server/services/_shared/aiGuard/topicRelevance.ts",
];

/**
 * D-M: measured at 9.5% (lessonInsightsAI) and 11.1% (quizAI) false positives,
 * all of it untrusted_data_echo on lessons that legitimately discuss the wrapper
 * tag. The boundary runs and emits on those two surfaces; it does not block.
 */
const REPORT_ONLY: RuleStatus = {
	status: "applied_with_exception",
	reason:
		"Report-only (D-M). validateModelText runs over every persisted model-authored field and emits output_validation_failed, but the generation is not rejected: the measured false-positive rate on this surface is ~10%, and a rejection here produces no error the caller can act on. Enforcement is a follow-up gated on bringing untrusted_data_echo's FP down — residual 7a.",
};

const NOT_RENDERED_AS_MARKDOWN: RuleStatus = {
	status: "n/a",
	reason:
		"Renders as plain React text nodes (StudyGuideCard / LearningPathCard / QuestionCard), never as markdown, so there is no link or image destination for a renderer to follow.",
};

export const AI_SURFACES: SurfaceConformance[] = [
	{
		feature: "lessonAI",
		modelCallers: ["server/services/lessonAI/lessonAI.agent.ts"],
		trpcProcedures: [],
		rawRoutes: ["app/api/chat/lesson/route.ts"],
		inputGuard: APPLIED,
		wrapping: APPLIED,
		outputBoundary: {
			system_prompt_echo: APPLIED,
			untrusted_data_echo: APPLIED,
			off_origin_link: APPLIED,
		},
		renderPolicy: APPLIED,
		resourceLimits: APPLIED,
		exclusions: [
			"verbatim_chunk_echo is a dump detector, not a paraphrase detector: reformatting defeats it.",
		],
	},
	{
		feature: "courseAI",
		modelCallers: [
			"server/services/courseAI/graph/nodes/chatResponse.ts",
			"server/services/courseAI/graph/nodes/clarify.ts",
			"server/services/courseAI/graph/nodes/classifyIntent.ts",
			"server/services/courseAI/graph/nodes/assessCompletion.ts",
			"server/services/courseAI/graph/nodes/extractStepData.ts",
			"server/services/courseAI/graph/nodes/confidenceScore.ts",
			"server/services/courseAI/graph/nodes/revisePriorField.ts",
			"server/services/courseAI/graph/nodes/toolRouter.ts",
			"server/services/courseAI/tools/validateCurriculumCoherence.ts",
		],
		// Declared fact, not an omission: server/api/routers/ai.ts is Prisma reads
		// only. The builder's model calls all enter through the raw SSE route.
		trpcProcedures: [],
		rawRoutes: ["app/api/chat/course/route.ts"],
		inputGuard: APPLIED,
		wrapping: APPLIED,
		outputBoundary: {
			system_prompt_echo: APPLIED,
			untrusted_data_echo: APPLIED,
			off_origin_link: APPLIED,
		},
		renderPolicy: APPLIED,
		resourceLimits: APPLIED,
		exclusions: [
			"The finalize path (START --finalize--> extract_step_data -> validate -> confidence_score -> persist_and_emit) commits model-authored draftStepData — course title, subtitle, section titles — with no output boundary in front of it. Residual is low: no free prose, and a human reviews before a Course exists. It is not zero: course title and subtitle feed CourseEmbedding -> search_similar_courses -> another instructor's builder.",
			"chat_response deliberately does not read state.messages, so tool results carrying other instructors' course copy never reach a streamed reply.",
			"revise_prior_field persists structured model output to CourseGeneration.content BEFORE chat_response, and therefore before the output boundary. The write is priced by D-L (content_revised_retained) rather than prevented, and course title/subtitle written this way feed the same CourseEmbedding -> search_similar_courses tail as the finalize exclusion.",
		],
	},
	{
		feature: "quizAI",
		modelCallers: ["server/services/quizAI/quizAI.agent.ts"],
		trpcProcedures: ["quiz.generateAI"],
		rawRoutes: [],
		inputGuard: {
			status: "n/a",
			reason:
				"UNGUARDED_BY_DESIGN: the caller supplies a lesson id, a bounded count and a boolean. The untrusted text arrives from the database and is wrapped, not guarded.",
		},
		wrapping: APPLIED,
		outputBoundary: {
			system_prompt_echo: REPORT_ONLY,
			untrusted_data_echo: REPORT_ONLY,
			off_origin_link: NOT_RENDERED_AS_MARKDOWN,
		},
		renderPolicy: NOT_RENDERED_AS_MARKDOWN,
		resourceLimits: APPLIED,
		exclusions: [
			"The answer key itself is model-authored: a poisoned lesson can steer which option is marked correct, and no layer here checks that. Tracked separately as a content defect.",
		],
	},
	{
		feature: "lessonInsightsAI",
		modelCallers: [
			"server/services/lessonInsightsAI/chains/summary.chain.ts",
			"server/services/lessonInsightsAI/chains/concepts.chain.ts",
			"server/services/lessonInsightsAI/chains/glossary.chain.ts",
		],
		trpcProcedures: ["lessonInsightsAI.generateLessonInsights"],
		rawRoutes: [],
		inputGuard: {
			status: "n/a",
			reason:
				"UNGUARDED_BY_DESIGN: the whole input is one lesson id. The lesson content that reaches the model is wrapped by the service.",
		},
		wrapping: APPLIED,
		outputBoundary: {
			system_prompt_echo: REPORT_ONLY,
			untrusted_data_echo: REPORT_ONLY,
			off_origin_link: NOT_RENDERED_AS_MARKDOWN,
		},
		renderPolicy: NOT_RENDERED_AS_MARKDOWN,
		resourceLimits: APPLIED,
		exclusions: [
			"LessonInsights.concepts is the write allowlist for ConceptMastery. The read boundary bounds and shapes it; it does not judge whether the concepts are the right ones.",
		],
	},
	{
		feature: "learningPathAI",
		modelCallers: [
			"server/services/learningPathAI/nodes/mergeAndExplain.node.ts",
			"server/services/learningPathAI/nodes/reflectAndCheck.node.ts",
		],
		trpcProcedures: ["learningPath.regenerate"],
		rawRoutes: ["app/api/chat/learning-path/route.ts"],
		inputGuard: {
			status: "n/a",
			reason:
				"UNGUARDED_BY_DESIGN: a student asks for their next steps in one course. Every other value in the prompt comes from their own progress records.",
		},
		wrapping: APPLIED,
		outputBoundary: {
			system_prompt_echo: APPLIED,
			untrusted_data_echo: APPLIED,
			off_origin_link: NOT_RENDERED_AS_MARKDOWN,
		},
		renderPolicy: NOT_RENDERED_AS_MARKDOWN,
		resourceLimits: APPLIED,
		exclusions: [
			"After three failed semantic validations the node gives up and throws; the event says so, but no path is produced.",
		],
	},
];
