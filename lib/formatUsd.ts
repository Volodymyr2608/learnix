/** Whole-dollar USD, e.g. 9515000 -> "$95,150". Shows "$0" (not "Free") for zero. */
export function formatUsd(cents: number): string {
	const dollars = Math.round(cents / 100);
	const safe = dollars === 0 ? 0 : dollars; // normalise -0
	return `$${safe.toLocaleString("en-US")}`;
}

const oneDecimal = (n: number): string => {
	const rounded = Math.round(n * 10) / 10;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/**
 * Compact whole-dollar USD for chart axis ticks, e.g. 9515000 -> "$95.2k",
 * 110000000 -> "$1.1M". Shows "$0" for zero. Tooltips keep full `formatUsd`.
 */
export function formatUsdCompact(cents: number): string {
	const dollars = Math.round(cents / 100);
	const safe = dollars === 0 ? 0 : dollars; // normalise -0
	const abs = Math.abs(safe);
	if (abs < 1000) return `$${safe}`;
	if (abs < 1_000_000) {
		const kValue = Math.round((safe / 1000) * 10) / 10;
		if (Math.abs(kValue) >= 1000) return `$${oneDecimal(safe / 1_000_000)}M`;
		return `$${oneDecimal(kValue)}k`;
	}
	return `$${oneDecimal(safe / 1_000_000)}M`;
}
