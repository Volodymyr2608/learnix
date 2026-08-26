import { AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { z } from "zod";
import { env } from "@/lib/env";
import {
	buildTutorSystemPrompt,
	SYSTEM_PROMPT,
} from "@/server/services/lessonAI/lessonAI.agent";
import { promptHash, reportRun } from "../_shared/baseline";
import {
	DEFAULT_JUDGE_MODEL as JUDGE_MODEL,
	judgeReply,
	loadRubric,
	summariseJudgeScores,
} from "../_shared/judge";
import { categoryGate, flakyRows, rowStability } from "../_shared/score";
import {
	CATEGORIES,
	GATED_THRESHOLDS,
	JUDGED_CATEGORIES,
	loadTutorDataset,
	type TutorRow,
} from "./tutorDataset";

/**
 * Tool-selection and boundary behaviour for the lesson tutor, against the real
 * assembled system prompt (`buildTutorSystemPrompt`) — not a copy of it.
 *
 * What is stubbed is only the database: the four tools keep the real names,
 * descriptions and schemas, and each row decides what they return. That matters
 * most for the bait rows, where `retrieved: ""` reproduces exactly what
 * `retrieve_lesson_context` returns when the search finds nothing.
 *
 * Only the categories that must simply work are gated. Everything adversarial
 * or ambiguous is reported without a threshold, because a bar set before the
 * first measurement is a guess wearing the costume of a standard — the same
 * call `aiGuard/redteam` and `aiOutput/falsePositive` already make.
 *
 * The deterministic half lives here: which tool ran, which tool must not have
 * run, which phrase must be absent. Whether an answer is *good* — faithful,
 * complete, not invented — needs the judge and the rubric in
 * `docs/specs/ai-eval-rubric.md`.
 *
 * ## What this eval does NOT include, and why the numbers need it
 *
 * This is the bare agent. `guardUserInput` (L1/L2) never runs, and the
 * `mark_concept_understood` stub does not call `authorizeMarkConceptUnderstood`
 * the way the real tool does. So a failing tool-abuse or off-topic row means
 * *the model can be talked into it*, not that production is exploitable — in
 * production the topic guard and `toolPolicy` stand in front of exactly these
 * attempts. That is the point rather than a caveat: it measures how much work
 * the deterministic layers are doing, which is the one thing a green
 * end-to-end test can never show.
 */

/** The model, temperature and sampling production uses for the tutor. */
const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.4;

/**
 * Draws per row. Three is the smallest number that can tell "always", "never"
 * and "sometimes" apart, and matches what `aiOutput/*.eval.ts` already samples.
 */
const SAMPLES = 3;

/** What the real tools return when they find nothing. */
const NO_LESSON_CONTENT = "No relevant content found for this lesson.";
const NO_COURSE_CONTENT = "No relevant content found across this course.";
const NO_PROGRESS = "Student has not completed any lessons yet.";

/**
 * Stub tools carrying the real names, descriptions and schemas from
 * `server/services/lessonAI/tools/*.tool.ts`. Built per row so a row can stage
 * what retrieval returns — an empty result included.
 */
const buildStubTools = (row: TutorRow) => {
	const retrieved = row.input.retrieved ?? "Relevant lesson content returned.";
	const crossLesson = row.input.crossLesson ?? NO_COURSE_CONTENT;
	const progress = row.input.progress ?? NO_PROGRESS;

	return [
		tool(async () => (retrieved === "" ? NO_LESSON_CONTENT : retrieved), {
			name: "retrieve_lesson_context",
			description:
				"Returns the most relevant excerpts from the current lesson. Use for questions about this lesson's content. Do NOT use for questions asking which lesson or where in the course something was covered — use search_across_course for those.",
			schema: z.object({
				query: z
					.string()
					.min(2)
					.describe("The question or topic to search for"),
				k: z
					.number()
					.int()
					.min(1)
					.max(8)
					.optional()
					.describe("Number of chunks to retrieve (default 4)"),
			}),
		}),
		tool(async () => crossLesson, {
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
		tool(async () => progress, {
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
};

type RowResult = {
	id: string;
	category: TutorRow["category"];
	ok: boolean;
	failed: string[];
};

const checkRow = (
	row: TutorRow,
	toolsCalled: string[],
	answer: string,
): RowResult => {
	const text = answer.toLowerCase();
	const failed: string[] = [];

	for (const name of row.expected.tools_called ?? [])
		if (!toolsCalled.includes(name)) failed.push(`did not call ${name}`);

	for (const name of row.expected.tools_not_called ?? [])
		if (toolsCalled.includes(name)) failed.push(`called ${name}`);

	for (const phrase of row.expected.answer_contains ?? [])
		if (!text.includes(phrase.toLowerCase()))
			failed.push(`missing "${phrase}"`);

	for (const phrase of row.expected.answer_excludes ?? [])
		if (text.includes(phrase.toLowerCase())) failed.push(`leaked "${phrase}"`);

	return {
		id: row.id,
		category: row.category,
		ok: failed.length === 0,
		failed,
	};
};

export const runTutorEval = async (): Promise<boolean> => {
	const rows = loadTutorDataset();

	// The model, temperature and sampling production actually runs.
	//
	// This used to run at temperature 0 on the theory that it removed the
	// variance. It does not: two consecutive runs at 0, identical dataset and
	// prompt hash, still disagreed by a category. Greedy decoding is not a pure
	// function — tie-breaking and provider-side batching move it. Since a single
	// draw was never trustworthy, the honest choice is to measure the system as
	// shipped and say how often each row passes.
	const llm = new ChatOpenAI({
		model: MODEL,
		temperature: TEMPERATURE,
		apiKey: env.OPENAI_API_KEY,
	});

	const attempts = rows.flatMap((row) =>
		Array.from({ length: SAMPLES }, () => row),
	);

	const results = await Promise.all(
		attempts.map(async (row) => {
			const agent = createAgent({
				model: llm,
				tools: buildStubTools(row),
				// The real builder, not a reconstruction of it: a field added to
				// the untrusted block in production reaches this eval for free.
				systemPrompt: buildTutorSystemPrompt({
					lessonTitle: row.input.lessonTitle,
					courseTitle: row.input.courseTitle ?? "Demo Course",
					lessonConcepts: row.input.concepts,
				}),
			});

			const history = (row.input.history ?? []).map((turn) => ({
				role: turn.role,
				content: turn.content,
			}));

			const result = await agent.invoke({
				messages: [...history, { role: "human", content: row.input.question }],
			});

			const toolsCalled = result.messages
				.filter((m): m is AIMessage => m instanceof AIMessage)
				.flatMap((m) => m.tool_calls ?? [])
				.map((tc) => tc.name);

			const lastAiMsg = [...result.messages]
				.reverse()
				.find((m): m is AIMessage => m instanceof AIMessage);
			const answer =
				typeof lastAiMsg?.content === "string" ? lastAiMsg.content : "";

			return { ...checkRow(row, toolsCalled, answer), row, answer };
		}),
	);

	// Judge only where quality is a judgement. The boundary categories already
	// have an exact answer above, so a second, larger model re-reading them adds
	// cost and noise to a number that is currently precise.
	const judgeable = results.filter((r) =>
		JUDGED_CATEGORIES.includes(r.category),
	);
	const rubric = loadRubric();
	const judged = await Promise.all(
		judgeable.map(async (r) => ({
			category: r.category as string,
			result: await judgeReply({
				question: r.row.input.question,
				retrievedContent:
					r.row.input.retrieved ?? "No relevant content found for this lesson.",
				reply: r.answer,
				rubric,
				model: JUDGE_MODEL,
			}),
		})),
	);

	console.log(
		`\ntutor — ${rows.length} rows x ${SAMPLES} samples at temperature ${TEMPERATURE}`,
	);

	const stability = rowStability(results);
	const flaky = flakyRows(stability);
	const alwaysFailing = stability.filter((row) => row.passed === 0);

	if (alwaysFailing.length > 0) {
		console.log(`\nFails every sample (${alwaysFailing.length} rows):`);
		for (const row of alwaysFailing) {
			const why = results.find((r) => r.id === row.id && !r.ok)?.failed ?? [];
			console.log(`  ${row.id.padEnd(16)} ${why.join("; ")}`);
		}
	}

	/**
	 * The number a single-sample run could not produce. These rows are neither
	 * passing nor failing — reporting either for them is reporting one draw.
	 */
	if (flaky.length > 0) {
		console.log(`\nFlaky — passes sometimes (${flaky.length} rows):`);
		for (const row of flaky)
			console.log(
				`  ${row.id.padEnd(16)} ${row.passed}/${row.samples} samples passed`,
			);
	}

	reportRun("lessonAI:tutor", {
		model: MODEL,
		// Ties the numbers to the prompt that produced them: a baseline taken
		// under a different prompt is a different system, not a regression.
		promptHash: promptHash(SYSTEM_PROMPT),
		samples: SAMPLES,
		judgeModel: JUDGE_MODEL,
		categories: CATEGORIES.map((category) => {
			const mine = results.filter((r) => r.category === category);
			return {
				category,
				passed: mine.filter((r) => r.ok).length,
				total: mine.length,
			};
		}).filter((c) => c.total > 0),
	});

	console.log(`\nJudge (${JUDGE_MODEL}) — mean score per axis, 1-5:`);
	console.log(
		`  ${"category".padEnd(20)} ${"rel".padStart(4)} ${"fai".padStart(4)} ${"com".padStart(4)} ${"gro".padStart(4)}  n`,
	);
	for (const summary of summariseJudgeScores(judged)) {
		const cell = (value: number | undefined) =>
			(value === undefined ? "—" : value.toFixed(1)).padStart(4);
		console.log(
			`  ${summary.category.padEnd(20)} ${cell(summary.means?.relevance)} ${cell(summary.means?.faithfulness)} ${cell(summary.means?.completeness)} ${cell(summary.means?.groundedness)}  ${summary.judged}` +
				(summary.failures > 0 ? `  (${summary.failures} unscorable)` : ""),
		);
	}

	console.log(
		`\n${flaky.length} of ${rows.length} rows are flaky. Ungated categories are a\n` +
			"measurement, not a bar. Read answer quality with the judge and the\n" +
			"rubric, not from these counts.",
	);

	// Over samples, not rows: a category's rate is now how often it passes,
	// which is the quantity a threshold can honestly be set against.
	// Deterministic results only. A judge score has never entered this call and
	// must not: scoring is a measurement, and a bar on a distribution nobody has
	// seen yet is a guess wearing the costume of a standard.
	return categoryGate("tutor", results, GATED_THRESHOLDS);
};
