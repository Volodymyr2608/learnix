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
import { mapWithConcurrency } from "../_shared/concurrency";
import {
	formatRunCost,
	recordUsage,
	takeRecordedUsage,
	usageOfMessage,
} from "../_shared/cost";
import {
	DEFAULT_JUDGE_MODEL as JUDGE_MODEL,
	judgeReply,
	loadRubric,
	rubricAnchors,
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
 * `ask_concept_check` stub does not call `authorizeAskConceptCheck`
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

/**
 * Judge calls in flight at once. Low on purpose: the judge prompt carries the
 * rubric, so a judged run is token-heavy enough to hit a per-minute account
 * ceiling long before it hits a request-rate one.
 */
const JUDGE_CONCURRENCY = 2;

/** What the real tools return when they find nothing. */
const NO_LESSON_CONTENT = "No relevant content found for this lesson.";
const NO_COURSE_CONTENT = "No relevant content found across this course.";
const NO_PROGRESS = "Student has not completed any lessons yet.";

/** The model answered without calling a retrieval tool at all. */
const NO_RETRIEVAL_ATTEMPTED = "The tutor did not call a retrieval tool.";

/**
 * Stub tools carrying the real names, descriptions and schemas from
 * `server/services/lessonAI/tools/*.tool.ts`. Built per row so a row can stage
 * what retrieval returns — an empty result included.
 */
export const buildStubTools = (row: TutorRow) => {
	const retrieved = row.input.retrieved ?? "Relevant lesson content returned.";
	const crossLesson = row.input.crossLesson ?? NO_COURSE_CONTENT;
	const progress = row.input.progress ?? NO_PROGRESS;

	/**
	 * What the retrieval tools actually handed the model this attempt.
	 *
	 * The judge scores faithfulness *against the content the tutor was given*,
	 * so it has to be given the same text — not a second guess at what that text
	 * probably was. Reconstructing it from the row is how the judge ended up
	 * grading cross-lesson answers against "No relevant content found": the row's
	 * content lived in `crossLesson`, which the reconstruction never read.
	 */
	const served: string[] = [];
	const serve = (content: string): string => {
		served.push(content);
		return content;
	};

	const tools = [
		tool(async () => serve(retrieved === "" ? NO_LESSON_CONTENT : retrieved), {
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
		tool(async () => serve(crossLesson), {
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
		// Mirrors the real tool's result exactly: a bare acknowledgement that
		// repeats nothing. A stub that echoed the question back would feed the
		// answer key into the model's context and measure a system we do not ship.
		tool(async () => "Question prepared. It will be shown with your reply.", {
			name: "ask_concept_check",
			description:
				"Asks the student one multiple-choice question about a concept, to check understanding they have claimed. You write the question and the options and say which option is correct; the server shuffles them and grades the answer. Call this instead of ever recording understanding yourself. Requires having called retrieve_lesson_context on this turn.",
			schema: z.object({
				concept: z
					.string()
					.min(1)
					.max(80)
					.describe(
						"The concept to check, named exactly as the lesson names it",
					),
				question: z
					.string()
					.min(10)
					.max(300)
					.describe(
						"The question. It must not contain the correct answer's text.",
					),
				options: z
					.array(z.string().min(1).max(120))
					.min(4)
					.max(5)
					.describe(
						"Four or five distinct answer options. Order is ignored — the server shuffles them.",
					),
				correctOption: z
					.string()
					.min(1)
					.max(120)
					.describe(
						"The exact text of the correct option, copied from options",
					),
			}),
		}),
	];

	return { tools, served };
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
	const startedAt = Date.now();
	const elapsedSeconds = () => ((Date.now() - startedAt) / 1000).toFixed(0);

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
			const { tools, served } = buildStubTools(row);
			const agent = createAgent({
				model: llm,
				tools,
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

			const aiMessages = result.messages.filter(
				(m): m is AIMessage => m instanceof AIMessage,
			);
			// A ReAct turn is several model calls, not one: each tool round trip
			// is another completion, and cost is the sum of all of them.
			for (const message of aiMessages)
				recordUsage(MODEL, usageOfMessage(message));

			const toolsCalled = aiMessages
				.flatMap((m) => m.tool_calls ?? [])
				.map((tc) => tc.name);

			const lastAiMsg = [...aiMessages].reverse()[0];
			const answer =
				typeof lastAiMsg?.content === "string" ? lastAiMsg.content : "";

			return {
				...checkRow(row, toolsCalled, answer),
				row,
				answer,
				// Exactly what retrieval returned this attempt, in call order.
				// Deduplicated: a model that retries the same query would otherwise
				// show the judge one chunk twice. Distinct from NO_LESSON_CONTENT —
				// "never asked" and "asked and got nothing" are different behaviours
				// and must not read alike in a judge prompt.
				servedContent: served.length
					? [...new Set(served)].join("\n\n---\n\n")
					: NO_RETRIEVAL_ATTEMPTED,
			};
		}),
	);

	// Judge only where quality is a judgement. The boundary categories already
	// have an exact answer above, so a second, larger model re-reading them adds
	// cost and noise to a number that is currently precise.
	// One sample per row, not all three. 43 rows x 3 samples of judged categories
	// is ~71k tokens of judge prompt, and this account's gpt-4o ceiling is 30k
	// tokens per minute — no ordering fits that inside one minute. Judging the
	// first draw of each row costs ~29k and does fit. The price is that judge
	// scores carry no per-row variance of their own; that needs a higher rate
	// limit, and until then the deterministic side is where flakiness is read.
	const seen = new Set<string>();
	const judgeable = results.filter((r) => {
		if (!JUDGED_CATEGORIES.includes(r.category)) return false;
		if (seen.has(r.id)) return false;
		seen.add(r.id);
		return true;
	});
	// Anchors only, and a few at a time. The judge prompt carries the rubric, so
	// it is an order of magnitude larger than a tutor call; firing all of them at
	// once put the run past the account's per-minute token ceiling and returned
	// 429s that arrived looking exactly like a judge that could not score.
	const rubric = rubricAnchors(loadRubric());
	const judged = await mapWithConcurrency(
		judgeable,
		JUDGE_CONCURRENCY,
		async (r) => ({
			id: r.id,
			category: r.category as string,
			result: await judgeReply({
				question: r.row.input.question,
				retrievedContent: r.servedContent,
				reply: r.answer,
				rubric,
				model: JUDGE_MODEL,
			}),
		}),
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

	const judgeByCategory = new Map(
		summariseJudgeScores(judged).map((entry) => [entry.category, entry]),
	);

	reportRun("lessonAI:tutor", {
		model: MODEL,
		// Ties the numbers to the prompt that produced them: a baseline taken
		// under a different prompt is a different system, not a regression.
		promptHash: promptHash(SYSTEM_PROMPT),
		samples: SAMPLES,
		judgeModel: JUDGE_MODEL,
		categories: CATEGORIES.map((category) => {
			const mine = results.filter((r) => r.category === category);
			const scores = judgeByCategory.get(category);
			return {
				category,
				passed: mine.filter((r) => r.ok).length,
				total: mine.length,
				// Committed so the figures quoted in docs can be checked against
				// something rather than taken on trust.
				...(scores?.means
					? { judge: { ...scores.means, judged: scores.judged } }
					: {}),
			};
		}).filter((c) => c.total > 0),
	});

	const unscorable = judged.filter((entry) => !entry.result.ok);
	if (unscorable.length > 0) {
		// Printed, not just counted: the first judged run reported 13 of these and
		// they were all rate limits, not judge failures. A count alone would have
		// read as "the judge cannot score this surface".
		console.log(`\nUnscorable (${unscorable.length}):`);
		for (const entry of unscorable.slice(0, 5))
			console.log(
				`  ${entry.id.padEnd(16)} ${entry.result.ok ? "" : entry.result.reason.slice(0, 120)}`,
			);
	}

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

	const usage = takeRecordedUsage();
	console.log(`\nCost of this run (${elapsedSeconds()}s wall clock):`);
	console.log(formatRunCost(usage));

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
