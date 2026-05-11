import { ChatOpenAI } from "@langchain/openai";
import { createAgent, type ReactAgent } from "langchain";
import { env } from "@/lib/env";
import { buildGetStudentProgressTool } from "./tools/getStudentProgress.tool";
import { buildMarkConceptUnderstoodTool } from "./tools/markConceptUnderstood.tool";
import { buildRetrieveLessonContextTool } from "./tools/retrieveLessonContext.tool";
import { buildSearchAcrossCourseTool } from "./tools/searchAcrossCourse.tool";

const SYSTEM_PROMPT = `You are an AI tutor for the lesson "{lessonTitle}" in the course "{courseTitle}".

Rules:
- Always call retrieve_lesson_context before answering a question that needs lesson knowledge.
- Call search_across_course only when the question requires context from other lessons (e.g. "where did we cover X", prerequisite questions).
- Call get_student_progress to personalise your explanation to what the student has already seen.
- Call mark_concept_understood only after the student explicitly demonstrates understanding — not after a successful explanation alone.
- Only answer questions related to this lesson or its direct prerequisites.
- Keep answers concise. Use examples from the lesson content when possible.
- Never paste raw lesson content verbatim — synthesise and explain.`;

export function createLessonAgent(params: {
	lessonId: string;
	lessonTitle: string;
	courseTitle: string;
	studentId: string;
	courseId: string;
}): ReactAgent {
	const llm = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0.4,
		streaming: true,
		apiKey: env.OPENAI_API_KEY,
	});

	return createAgent({
		model: llm,
		tools: [
			buildRetrieveLessonContextTool(params.lessonId),
			buildSearchAcrossCourseTool(params.courseId),
			buildGetStudentProgressTool(params.studentId, params.courseId),
			buildMarkConceptUnderstoodTool(params.studentId, params.courseId),
		],
		systemPrompt: SYSTEM_PROMPT.replace(
			"{lessonTitle}",
			params.lessonTitle,
		).replace("{courseTitle}", params.courseTitle),
	});
}
