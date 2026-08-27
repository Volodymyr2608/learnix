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

// Precision gate: penalises false positives (predicted=true, expected=false) more
// harshly than false negatives. Used by evals where premature advancement is
// more costly than excessive caution.
export function precisionGate(
	label: string,
	results: Array<{ id: string; predicted: boolean; expected: boolean }>,
	threshold: number,
): boolean {
	const truePositives = results.filter((r) => r.predicted && r.expected).length;
	const falsePositives = results.filter(
		(r) => r.predicted && !r.expected,
	).length;
	const precision =
		truePositives + falsePositives === 0
			? 1
			: truePositives / (truePositives + falsePositives);
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
