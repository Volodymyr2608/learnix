/** Whole-dollar USD, e.g. 9515000 -> "$95,150". Shows "$0" (not "Free") for zero. */
export function formatUsd(cents: number): string {
	const dollars = Math.round(cents / 100);
	const safe = dollars === 0 ? 0 : dollars; // normalise -0
	return `$${safe.toLocaleString("en-US")}`;
}
