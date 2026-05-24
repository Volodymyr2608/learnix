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
