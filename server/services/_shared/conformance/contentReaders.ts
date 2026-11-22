/**
 * AC-L7 / AI-C7 — every module that reads lesson content, lesson chunks or study guides, and the
 * gate that keeps a student from reading a lesson they have not opened (FR-P19a).
 *
 * - `opened`: student-facing; must join `lessonOpenedBy` / `openedBy` / `opened_lessons`.
 * - `records-open`: the lesson page itself — it records the open before returning content (C9).
 * - `instructor-only`: authorised to the course's instructor; students never reach it.
 * - `scoped-by-caller`: reads within a lesson or student the caller already gated (named in `why`).
 * - `definition`: the repository that defines the query; its callers carry the gate.
 *
 * `contentReaders.contract.test.ts` derives readers from the source; a new one fails the test
 * until it is listed here with its gate.
 */
export type ContentGate =
	| "opened"
	| "records-open"
	| "instructor-only"
	| "scoped-by-caller"
	| "definition";

export const CONTENT_READERS: {
	file: string;
	gate: ContentGate;
	why: string;
}[] = [
	{
		file: "server/services/lesson/lesson.service.ts",
		gate: "records-open",
		why: "getStudentLesson records the open fail-closed before returning the lesson (FR-P19, C9)",
	},
	{
		file: "server/services/lessonAI/tools/searchAcrossCourse.tool.ts",
		gate: "scoped-by-caller",
		why: "AI-C2: passes the closure-bound student to searchCourseChunks, whose SQL joins opened_lessons (the definition entry is checked; the signature requires the student)",
	},
	{
		file: "server/services/lessonAI/tools/retrieveLessonContext.tool.ts",
		gate: "scoped-by-caller",
		why: "reads only the route-authorised lesson, which the tutor route requires opened (AI-C1)",
	},
	{
		file: "server/services/lessonAI/lessonAI.service.ts",
		gate: "scoped-by-caller",
		why: "loads the insights of the route-authorised, opened lesson (AI-C1)",
	},
	{
		file: "server/services/lessonInsightsAI/lessonInsightsAI.service.ts",
		gate: "opened",
		why: "AI-C3: the student branch of getForLesson joins lessonOpenedBy; generation is instructor-only",
	},
	{
		file: "server/services/quiz/quiz.service.ts",
		gate: "opened",
		why: "AI-C4: verifyEnrollment reads openedBy for get and submit; the concept read is instructor-side",
	},
	{
		file: "server/services/quizAI/quizAI.service.ts",
		gate: "instructor-only",
		why: "quiz generation, scoped to section.course.instructorId",
	},
	{
		file: "server/services/quizAI/tools/getLessonContent.tool.ts",
		gate: "instructor-only",
		why: "a tool of the instructor's quiz-generation agent",
	},
	{
		file: "server/services/learningPathAI/nodes/mergeAndExplain.node.ts",
		gate: "scoped-by-caller",
		why: "AI-C6 accepted exception: one-sentence reasons for an enrolled student's path (spec FR-P19a)",
	},
	{
		file: "server/repositories/embedding.repository.ts",
		gate: "definition",
		why: "defines searchCourseChunks (gated in SQL) and searchLessonChunks (one authorised lesson)",
	},
];
