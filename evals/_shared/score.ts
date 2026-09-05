export type EvalResult = { id: string; ok: boolean };

export type CategoryEvalResult = EvalResult & { category: string };

export type RowStability = {
	id: string;
	category: string;
	passed: number;
	samples: number;
};

/**
 * Collapses repeated samples of the same row into how often it passed.
 *
 * With one sample a row is a boolean, which is the shape that makes an eval
 * look deterministic when it is not. With several it is a rate, and the rate is
 * the honest answer.
 */
export const rowStability = (results: CategoryEvalResult[]): RowStability[] => {
	const byRow = new Map<string, RowStability>();

	for (const result of results) {
		const existing = byRow.get(result.id);
		if (existing) {
			existing.samples += 1;
			if (result.ok) existing.passed += 1;
			continue;
		}
		byRow.set(result.id, {
			id: result.id,
			category: result.category,
			passed: result.ok ? 1 : 0,
			samples: 1,
		});
	}

	return [...byRow.values()];
};

/**
 * Rows that neither always pass nor always fail — the ones a single-sample run
 * reports as a confident boolean while the truth is a coin weighted somewhere
 * in between.
 */
export const flakyRows = (stability: RowStability[]): RowStability[] =>
	stability.filter((row) => row.passed > 0 && row.passed < row.samples);

/**
 * Scores per category and gates only the categories given a threshold.
 *
 * Two different things share one run. Some categories are a contract — when
 * "answer an ordinary question about the lesson" drops, that is a regression.
 * Others are a measurement whose realistic value nobody knows yet; putting a
 * bar on those before the first run substitutes a guess for the number, which
 * is the mistake `aiGuard/redteam` and `aiOutput/falsePositive` avoid by not
 * gating at all. A category absent from `thresholds` is reported and can never
 * turn the run red.
 *
 * Gating per category rather than on the pooled average is the point: three
 * healthy categories can carry a fourth that is failing outright, and the
 * aggregate that hides it is exactly the number people quote.
 */
export function categoryGate(
	label: string,
	results: CategoryEvalResult[],
	thresholds: Record<string, number>,
): boolean {
	const categories = [...new Set(results.map((r) => r.category))].sort();
	let allPassed = true;

	console.log(`\n${label} — by category:`);
	for (const category of categories) {
		const mine = results.filter((r) => r.category === category);
		const passed = mine.filter((r) => r.ok).length;
		const rate = mine.length ? passed / mine.length : 0;
		const threshold = thresholds[category];
		const gated = threshold !== undefined;

		console.log(
			`  ${(gated ? "gated " : "      ") + category.padEnd(20)} ` +
				`${String(passed).padStart(2)}/${String(mine.length).padEnd(2)} ` +
				`${(rate * 100).toFixed(1).padStart(5)}%` +
				`${gated ? `  (min ${(threshold * 100).toFixed(0)}%)` : ""}`,
		);

		if (gated && rate < threshold) allPassed = false;
	}

	const failures = results.filter(
		(r) => !r.ok && thresholds[r.category] !== undefined,
	);
	if (failures.length)
		console.log(
			`\n${label} gated failures:`,
			failures.map((r) => r.id).join(", "),
		);

	if (!allPassed)
		console.error(`FAIL: ${label} — a gated category is below its threshold`);

	return allPassed;
}

export type ScoredRow = { id: string; score: number; expected: boolean };

/**
 * Every row's score against its label, ordered — the twenty numbers behind the
 * one a gate prints.
 *
 * A gate answers "how many were wrong". This answers the question that decides
 * what to do about it: **where** the wrong ones sit. False positives clustered
 * below every correct row mean the model ordered the set correctly and the cut
 * point is misplaced — a prompt, or in principle a threshold, can move that. A
 * false positive scoring above a correct row means the ranking itself is broken,
 * and no cut point exists that separates them; wording the prompt differently is
 * then the wrong repair to reach for.
 *
 * The distinction is invisible in the pass/fail line, and it is the difference
 * between a fix and a fix-shaped guess.
 */
export const formatScoreTable = (
	rows: readonly ScoredRow[],
	threshold: number,
): string => {
	const header = `  ${"row".padEnd(6)}${"score".padStart(5)}  label`;

	const lines = [...rows]
		.sort((a, b) => b.score - a.score)
		.map((row) => {
			// Below the threshold nothing advanced, so an incomplete row there is
			// the node behaving correctly — marking it would report recall as if
			// it were precision.
			const falsePositive = row.score >= threshold && !row.expected;

			return (
				`  ${row.id.padEnd(6)}${row.score.toFixed(2).padStart(5)}  ` +
				`${(row.expected ? "complete" : "sparse").padEnd(9)}` +
				`${falsePositive ? " <- false positive" : ""}`
			);
		});

	return [header, ...lines].join("\n");
};

/**
 * How many rows that SHOULD clear the threshold still do.
 *
 * The companion to a precision gate, and not an optional one. Precision asks
 * "of the rows we advanced, how many deserved it" — a question a node maximises
 * by advancing almost nothing. `accuracyGate` catches only the total surrender
 * (an empty set scores 0); the reachable failure is partial, and it reads as a
 * perfect score: keep three unmistakable rows above the line, push the other
 * eight complete ones under it, and the run reports 100% while eight instructors
 * are sent to a manual Accept they did not need.
 *
 * The floor is deliberately below the full count. A gate that reddens when one
 * row drifts across the line teaches its readers to ignore it, and drift is what
 * a provider does between two runs of the same prompt.
 */
export const retentionGate = (
	label: string,
	rows: readonly ScoredRow[],
	{ threshold, floor }: { threshold: number; floor: number },
): boolean => {
	const complete = rows.filter((row) => row.expected);
	const retained = complete.filter((row) => row.score >= threshold);
	const dropped = complete.filter((row) => row.score < threshold);

	console.log(
		`${label} retention: ${retained.length}/${complete.length} complete rows at or above ${threshold} (min ${floor})`,
	);
	if (dropped.length)
		console.log(`${label} dropped:`, dropped.map((row) => row.id).join(", "));

	if (retained.length < floor) {
		console.error(
			`FAIL: ${label} retained ${retained.length} complete rows, below the floor of ${floor}`,
		);
		return false;
	}

	return true;
};

export function accuracyGate(
	label: string,
	results: EvalResult[],
	threshold: number,
): boolean {
	const passed = results.filter((r) => r.ok).length;
	const accuracy = results.length ? passed / results.length : 0;
	console.log(
		`${label} accuracy: ${(accuracy * 100).toFixed(1)}% (${passed}/${results.length})`,
	);
	const failures = results.filter((r) => !r.ok).map((r) => r.id);
	if (failures.length) console.log(`${label} failures:`, failures);
	if (accuracy < threshold) {
		console.error(`FAIL: ${label} accuracy below ${threshold} threshold`);
		return false;
	}
	return true;
}

/**
 * Precision gate: penalises false positives (predicted=true, expected=false)
 * more harshly than false negatives. Used by evals where premature advancement
 * is more costly than excessive caution.
 *
 * **A run that predicted nothing fails.** "Of the rows we advanced, all deserved
 * it" is vacuously true of a run that advanced none, and this gate used to
 * return 1 for exactly that. `courseAI:assessCompletion` reported 100% while
 * making zero model calls: its eval passed an empty user message, the node's
 * first guard returned early on it, every prediction came back false, and the
 * gate called the absence perfect. An absent measurement is not a passing one.
 *
 * It is not 0% precision either, which is why the failure says what happened
 * instead of printing a number a reader would try to interpret.
 */
export function precisionGate(
	label: string,
	results: Array<{ id: string; predicted: boolean; expected: boolean }>,
	threshold: number,
): boolean {
	const truePositives = results.filter((r) => r.predicted && r.expected).length;
	const falsePositives = results.filter(
		(r) => r.predicted && !r.expected,
	).length;
	if (truePositives + falsePositives === 0) {
		console.log(`${label}: no rows predicted true — this run measured nothing`);
		console.error(
			`FAIL: ${label} made no positive predictions, so its precision is undefined rather than perfect`,
		);
		return false;
	}

	const precision = truePositives / (truePositives + falsePositives);
	console.log(
		`${label} precision on ready=true: ${(precision * 100).toFixed(1)}%`,
	);
	const falsePositiveIds = results
		.filter((r) => r.predicted && !r.expected)
		.map((r) => r.id);
	if (falsePositiveIds.length)
		console.log(`${label} false positives:`, falsePositiveIds);
	if (precision < threshold) {
		console.error(`FAIL: ${label} precision below ${threshold} threshold`);
		return false;
	}
	return true;
}
