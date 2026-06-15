export const DEFAULT_PLATFORM_FEE_PERCENT = 20;

export function computeSplit(
	amountCents: number,
	feePercent: number = DEFAULT_PLATFORM_FEE_PERCENT,
): { platformFeeCents: number; instructorNetCents: number } {
	// Guard against a missing/non-numeric fee percent: env validation (which
	// applies the default) is skipped in tests, so the raw value may be undefined
	// or a string. Fall back to the documented default rather than producing NaN.
	const numericPercent = Number(feePercent);
	const resolvedPercent = Number.isFinite(numericPercent)
		? numericPercent
		: DEFAULT_PLATFORM_FEE_PERCENT;
	const platformFeeCents = Math.round((amountCents * resolvedPercent) / 100);
	return {
		platformFeeCents,
		instructorNetCents: amountCents - platformFeeCents,
	};
}
