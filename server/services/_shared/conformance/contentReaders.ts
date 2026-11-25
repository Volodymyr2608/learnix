/**
 * AC-L7 / AI-C7 — every module that reads lesson content, lesson chunks or study guides, and the
 * gate that keeps a student from reading a lesson they have not opened (FR-P19a).
 *
 * - `opened`: student-facing; must join `lessonOpenedBy` / `openedBy` / `opened_lessons`.
 * - `records-open`: the lesson page itself — it records the open before returning content (C9).
 * - `instructor-only`: authorised to the course's instructor; students never reach it.
 * - `scoped-by-caller`: reads within a lesson or student the caller already gated (named in `why`).
 * - `definition`: the repository that defines the query; its callers carry the gate.
 * - `strips-content`: loads lesson rows but returns no content (the fields it returns are in `why`).
 *
 * `opened` and `definition` entries name the function (`symbol`) that must contain the gate
 * (`lessonOpenedBy` / `lessonOpenedSelect` / `opened_lessons`) — checked inside that function,
 * not anywhere in the file.
 *
 * `contentReaders.contract.test.ts` derives readers from the source; a new one fails the test
 * until it is listed here with its gate.
 */
export type ContentGate =
	| "opened"
	| "records-open"
	| "instructor-only"
	| "scoped-by-caller"
	| "definition"
	| "strips-content";

export const CONTENT_READERS: {
	file: string;
	gate: ContentGate;
	symbol?: string;
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
		symbol: "getForLesson",
		why: "AI-C3: the student branch of getForLesson joins lessonOpenedBy; generation is instructor-only",
	},
	{
		file: "server/services/quiz/quiz.service.ts",
		gate: "opened",
		symbol: "verifyEnrollment",
		why: "AI-C4: verifyEnrollment selects lessonOpenedSelect for get and submit; the concept read is instructor-side",
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
		symbol: "searchCourseChunks",
		why: "defines searchCourseChunks (gated in SQL) and searchLessonChunks (one authorised lesson)",
	},
	{
		file: "server/repositories/lesson.repository.ts",
		gate: "strips-content",
		why: "listOrderedWithConcepts loads lesson rows for the learning path and returns only id, title, section and concepts",
	},
	{
		file: "server/repositories/course.repository.ts",
		gate: "instructor-only",
		why: "getOwnCourse: the course where instructorId is the caller",
	},
	{
		file: "server/services/course/course.service.ts",
		gate: "instructor-only",
		why: "updateCourse reads the instructor's own course (where instructorId)",
	},
];
