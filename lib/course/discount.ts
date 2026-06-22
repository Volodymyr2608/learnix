export function computeDiscountPercent(
	priceCents: number,
	originalPriceCents: number | null | undefined,
): number | null {
	if (!originalPriceCents || originalPriceCents <= priceCents) return null;
	return Math.round((1 - priceCents / originalPriceCents) * 100);
}
