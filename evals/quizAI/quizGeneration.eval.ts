import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { z } from "zod";
import { env } from "@/lib/env";
import type { QuizQuestion } from "@/server/services/quizAI/schemas/quizOutput.schema";
import { QuizOutputSchema } from "@/server/services/quizAI/schemas/quizOutput.schema";
import { accuracyGate } from "../_shared/score";

type Row = {
	id: string;
	count: number;
	level: string;
	lessonContent: string;
};

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/quizAI/quizGeneration.jsonl",
);

const SYSTEM_PROMPT = `You are an expert quiz writer for an online learning platform.

Your job is to generate exactly {count} multiple-choice questions for a lesson.

Rules:
1. Call get_lesson_content first to understand the lesson material.
2. Call get_existing_quizzes to check for existing questions — never duplicate them.
3. Generate exactly {count} questions based on the lesson content.
4. Each question must have exactly 4 answer options.
5. The "correct" field must be verbatim identical to one of the 4 options — no paraphrasing.
6. Calibrate difficulty to {level} level (Beginner = basic recall, Intermediate = application, Advanced = analysis/synthesis).
7. Output must conform to the required schema — no markdown, no extra keys.`;

function isStructurallyValid(questions: QuizQuestion[]): boolean {
	return questions.every(
		(q) => q.options.length === 4 && q.options.includes(q.correct),
	);
}

export async function runQuizGenerationEval(): Promise<boolean> {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const results = await Promise.all(
		rows.map(async (r) => {
			const llm = new ChatOpenAI({
				model: "gpt-4o-mini",
				temperature: 0.3,
				apiKey: env.OPENAI_API_KEY,
			});

			// Stub tools: return the row's lesson content without DB access.
			const getLessonContentStub = tool(
				async () => `Title: Eval Lesson\n\n${r.lessonContent}`,
				{
					name: "get_lesson_content",
					description:
						"Reads the lesson title and content to understand what questions to generate.",
					schema: z.object({ lessonId: z.string() }),
				},
			);
			const getExistingQuizzesStub = tool(
				async () => "No existing questions for this lesson.",
				{
					name: "get_existing_quizzes",
					description:
						"Reads existing quiz questions for the lesson so you avoid generating duplicates.",
					schema: z.object({ lessonId: z.string() }),
				},
			);

			const systemPrompt = SYSTEM_PROMPT.replace(
				"{count}",
				String(r.count),
			).replace("{level}", r.level);

			const agent = createAgent({
				model: llm,
				tools: [getLessonContentStub, getExistingQuizzesStub],
				systemPrompt,
				responseFormat: QuizOutputSchema,
			});

			const result = await agent.invoke({
				messages: [
					{
						role: "user",
						content: `Generate ${r.count} questions for lesson eval-${r.id}.`,
					},
				],
			});

			const questions = (
				result.structuredResponse as { questions: QuizQuestion[] }
			).questions;

			return {
				id: r.id,
				ok: questions.length === r.count && isStructurallyValid(questions),
			};
		}),
	);

	return accuracyGate("quizGeneration", results, 0.9);
}
