export type EvalResult = { id: string; ok: boolean };

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
