import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { z } from "zod";
import { env } from "@/lib/env";
import { buildTutorSystemPrompt } from "@/server/services/lessonAI/lessonAI.agent";
import { accuracyGate } from "../_shared/score";

type Row = {
	input: {
		lessonTitle: string;
		courseTitle?: string;
		concepts?: string[];
		question: string;
	};
	expected: { tools_called: string[]; answer_contains: string[] };
};

const DATASET = resolve(process.cwd(), "evals/datasets/tutor.jsonl");

// Stub tools: same name/description/schema as the real ones
// (server/services/lessonAI/tools/*.tool.ts) — no DB or embeddings access.
// What's stubbed is only the database, never the prompt or the wrapping
// (same fidelity boundary evals/aiOutput/*.eval.ts already documents).
const stubTools = [
	tool(async () => "Relevant lesson content returned.", {
		name: "retrieve_lesson_context",
		description:
			"Returns the most relevant excerpts from the current lesson. Use for questions about this lesson's content. Do NOT use for questions asking which lesson or where in the course something was covered — use search_across_course for those.",
		schema: z.object({
			query: z.string().min(2).describe("The question or topic to search for"),
			k: z
				.number()
				.int()
				.min(1)
				.max(8)
				.optional()
				.describe("Number of chunks to retrieve (default 4)"),
		}),
	}),
	tool(async () => "No relevant cross-lesson content found.", {
		name: "search_across_course",
		description:
			"Searches all lessons in this course for relevant excerpts. Use for questions like 'where did we cover X' or to surface prerequisite material.",
		schema: z.object({
			query: z
				.string()
				.min(2)
				.describe("The concept or topic to search for across the course"),
			k: z
				.number()
				.int()
				.min(1)
				.max(8)
				.optional()
				.describe("Number of chunks to retrieve (default 4)"),
		}),
	}),
	tool(async () => "Student has not completed any lessons yet.", {
		name: "get_student_progress",
		description:
			"Returns the list of lessons the student has already completed in this course. Use this to tailor explanations to their level.",
		schema: z.object({}),
	}),
	tool(
		async ({ concept, level }: { concept: string; level: number }) =>
			`Recorded: "${concept}" at level ${level}.`,
		{
			name: "mark_concept_understood",
			description:
				"Records that the student has demonstrated understanding of a concept. Levels: 0 = unfamiliar, 1 = exposed, 2 = applied. Level 3 (mastered) is earned by completing the lesson's quizzes and cannot be set from conversation. Use sparingly — only when the student explicitly demonstrates understanding.",
			schema: z.object({
				concept: z
					.string()
					.min(1)
					.max(80)
					.describe("The concept the student demonstrated understanding of"),
				level: z
					.number()
					.int()
					.min(0)
					.max(3)
					.describe("Mastery level: 0 unfamiliar, 1 exposed, 2 applied"),
			}),
		},
	),
];

export async function runTutorEval(): Promise<boolean> {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	// Same model production uses for the tutor. Temperature stays 0 here —
	// prod runs 0.4 — until sampling lands (area-2 З10): a single run at 0.4
	// would be flaky with nothing yet in place to average it out.
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
				// The real builder, not a reconstruction of it: a field added to
				// the untrusted block in production reaches this eval for free.
				systemPrompt: buildTutorSystemPrompt({
					lessonTitle: r.input.lessonTitle,
					courseTitle: r.input.courseTitle ?? "Demo Course",
					lessonConcepts: r.input.concepts,
				}),
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
