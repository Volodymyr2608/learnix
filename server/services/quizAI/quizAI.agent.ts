import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { env } from "@/lib/env";
import { UNTRUSTED_DATA_CLAUSE } from "@/server/services/_shared/aiGuard/messages";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import { QuizOutputSchema } from "./schemas/quizOutput.schema";
import { buildGetExistingQuizzesTool } from "./tools/getExistingQuizzes.tool";
import { buildGetLessonContentTool } from "./tools/getLessonContent.tool";

export const QUIZ_INITIAL_SYSTEM_PROMPT = `You are an expert quiz writer for an online learning platform.

		Your job is to generate exactly {count} multiple-choice questions for a lesson.

		Rules:
		1. Call get_lesson_content first to read the lesson you are writing questions for.
		2. Call get_existing_quizzes to check for existing questions — never duplicate them.
		3. Generate exactly {count} questions based on the lesson content.
		4. Each question must have exactly 4 answer options.
		5. The "correct" field must be verbatim identical to one of the 4 options — no paraphrasing.
		6. Calibrate difficulty to {level} level (Beginner = basic recall, Intermediate = application, Advanced = analysis/synthesis).
		7. Output must conform to the required schema — no markdown, no extra keys.

		${UNTRUSTED_DATA_CLAUSE}`;

const initialTemplate = ChatPromptTemplate.fromMessages([
	["system", QUIZ_INITIAL_SYSTEM_PROMPT],
]);

export const QUIZ_REGENERATE_SYSTEM_PROMPT = `You are an expert quiz writer for an online learning platform.

		Your job is to generate exactly {count} brand-new multiple-choice questions for a lesson.

		Rules:
		1. Call get_lesson_content first to read the lesson you are writing questions for.
		2. Do NOT call get_existing_quizzes. Generate completely fresh questions — different angles, scenarios, or aspects of the material than anything previously asked.
		3. Generate exactly {count} questions based on the lesson content.
		4. Each question must have exactly 4 answer options.
		5. The "correct" field must be verbatim identical to one of the 4 options — no paraphrasing.
		6. Calibrate difficulty to {level} level (Beginner = basic recall, Intermediate = application, Advanced = analysis/synthesis).
		7. Output must conform to the required schema — no markdown, no extra keys.

		${UNTRUSTED_DATA_CLAUSE}`;

const regenerateTemplate = ChatPromptTemplate.fromMessages([
	["system", QUIZ_REGENERATE_SYSTEM_PROMPT],
]);

export async function createQuizAgent(
	count: number,
	level: string,
	regenerate: boolean,
	lessonId: string,
) {
	const llm = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: regenerate ? 0.9 : 0.3,
		apiKey: env.OPENAI_API_KEY,
	});

	const template = regenerate ? regenerateTemplate : initialTemplate;
	// `Course.level` is z.string().min(1), not an enum — the API accepts arbitrary
	// text whatever the UI offers, so it is instructor-authored free text landing
	// in a system prompt. courseAI already treats this same field as untrusted
	// (validateCurriculumCoherence wraps it as course_data).
	const systemPrompt = await template.format({
		count,
		level: wrapUntrustedContent(level, "course_data"),
	});

	return createAgent({
		model: llm,
		tools: regenerate
			? [buildGetLessonContentTool(lessonId)]
			: [
					buildGetLessonContentTool(lessonId),
					buildGetExistingQuizzesTool(lessonId),
				],
		systemPrompt,
		responseFormat: QuizOutputSchema,
	});
}
