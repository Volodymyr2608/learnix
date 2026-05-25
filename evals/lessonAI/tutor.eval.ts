import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { z } from "zod";
import { env } from "@/lib/env";
import { accuracyGate } from "../_shared/score";

type Row = {
	input: { lessonTitle: string; question: string };
	expected: { tools_called: string[]; answer_contains: string[] };
};

const DATASET = resolve(process.cwd(), "evals/datasets/tutor.jsonl");

const SYSTEM_PROMPT = `You are an AI tutor for the lesson "{lessonTitle}" in the course "Demo Course".

Rules:
- Always call retrieve_lesson_context before answering a question that needs lesson knowledge.
- Call search_across_course only when the question requires context from other lessons (e.g. "where did we cover X", prerequisite questions).
- Call get_student_progress to personalise your explanation to what the student has already seen.
- Call mark_concept_understood only after the student explicitly demonstrates understanding — not after a successful explanation alone.
- Only answer questions related to this lesson or its direct prerequisites.
- Keep answers concise. Use examples from the lesson content when possible.
- Never paste raw lesson content verbatim — synthesise and explain.`;

// Stub tools: same names/descriptions as the real tools, but no DB access.
const stubTools = [
	tool(async () => "Relevant lesson content returned.", {
		name: "retrieve_lesson_context",
		description:
			"Returns the most relevant excerpts from the current lesson for a question. Always call this before answering questions about the lesson.",
		schema: z.object({
			query: z.string().min(2),
			k: z.number().int().min(1).max(8).optional(),
		}),
	}),
	tool(async () => "No relevant cross-lesson content found.", {
		name: "search_across_course",
		description:
			"Searches all lessons in this course for relevant excerpts. Use for questions like 'where did we cover X' or to surface prerequisite material.",
		schema: z.object({
			query: z.string().min(2),
			k: z.number().int().min(1).max(8).optional(),
		}),
	}),
	tool(async () => "Student has not completed any lessons yet.", {
		name: "get_student_progress",
		description:
			"Returns the list of lessons the student has already completed in this course.",
		schema: z.object({}),
	}),
	tool(async () => "Concept recorded.", {
		name: "mark_concept_understood",
		description:
			"Records that the student has demonstrated understanding of a concept. Use sparingly — only when the student explicitly demonstrates understanding.",
		schema: z.object({
			concept: z.string().min(1).max(80),
			level: z.number().int().min(0).max(3),
		}),
	}),
];

export async function runTutorEval(): Promise<boolean> {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const llm = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0,
		apiKey: env.OPENAI_API_KEY,
	});

	const results = await Promise.all(
		rows.map(async (r, i) => {
			const agent = createAgent({
				model: llm,
				tools: stubTools,
				systemPrompt: SYSTEM_PROMPT.replace(
					"{lessonTitle}",
					r.input.lessonTitle,
				),
			});
			const result = await agent.invoke({
				messages: [{ role: "human", content: r.input.question }],
			});

			const toolsCalled = result.messages
				.filter((m): m is AIMessage => m instanceof AIMessage)
				.flatMap((m) => m.tool_calls ?? [])
				.map((tc) => tc.name);

			const lastAiMsg = [...result.messages]
				.reverse()
				.find((m): m is AIMessage => m instanceof AIMessage);
			const answerText =
				typeof lastAiMsg?.content === "string"
					? lastAiMsg.content.toLowerCase()
					: "";

			const toolsOk = r.expected.tools_called.every((t) =>
				toolsCalled.includes(t),
			);
			const answerOk = r.expected.answer_contains.every((kw) =>
				answerText.includes(kw.toLowerCase()),
			);
			return { id: `row-${i}`, ok: toolsOk && answerOk };
		}),
	);

	return accuracyGate("tutor", results, 0.85);
}
