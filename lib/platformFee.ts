export function computeSplit(
	amountCents: number,
	feePercent: number,
): { platformFeeCents: number; instructorNetCents: number } {
	const platformFeeCents = Math.round((amountCents * feePercent) / 100);
	return {
		platformFeeCents,
		instructorNetCents: amountCents - platformFeeCents,
	};
}
