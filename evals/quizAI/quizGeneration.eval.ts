import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { z } from "zod";
import { env } from "@/lib/env";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import { QUIZ_INITIAL_SYSTEM_PROMPT } from "@/server/services/quizAI/quizAI.agent";
import type { QuizQuestion } from "@/server/services/quizAI/schemas/quizOutput.schema";
import { QuizOutputSchema } from "@/server/services/quizAI/schemas/quizOutput.schema";
import { accuracyGate } from "../_shared/score";
import { reportRunUsage, startRunUsage, usageRecorder } from "../_shared/usage";

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

// Same LangChain templating production uses (quizAI.agent.ts createQuizAgent,
// initial-generation branch) — {count}/{level} substitution goes through the
// prompt's own f-string engine, not a hand-rolled .replace() that would miss
// {count}'s second occurrence in rule 3.
const template = ChatPromptTemplate.fromMessages([
	["system", QUIZ_INITIAL_SYSTEM_PROMPT],
]);

function isStructurallyValid(questions: QuizQuestion[]): boolean {
	return questions.every(
		(q) => q.options.length === 4 && q.options.includes(q.correct),
	);
}

export async function runQuizGenerationEval(): Promise<boolean> {
	const recorder = usageRecorder();
	const startedAt = startRunUsage();
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

			// `level` is instructor-authored free text (Course.level is an
			// unconstrained string) — production wraps it as untrusted
			// course_data before interpolation; the eval must too.
			const systemPrompt = await template.format({
				count: r.count,
				level: wrapUntrustedContent(r.level, "course_data"),
			});

			const agent = createAgent({
				model: llm,
				tools: [getLessonContentStub, getExistingQuizzesStub],
				systemPrompt,
				responseFormat: QuizOutputSchema,
			});

			const result = await agent.invoke(
				{
					messages: [
						{
							role: "user",
							content: `Generate ${r.count} questions for lesson eval-${r.id}.`,
						},
					],
				},
				recorder.config,
			);

			const questions = (
				result.structuredResponse as { questions: QuizQuestion[] }
			).questions;

			return {
				id: r.id,
				ok: questions.length === r.count && isStructurallyValid(questions),
			};
		}),
	);

	reportRunUsage(recorder, startedAt, results.length);

	return accuracyGate("quizGeneration", results, 0.9);
}
