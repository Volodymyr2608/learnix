export function formatPrice(cents: number): string {
	if (cents <= 0) return "Free";
	return `$${(cents / 100).toFixed(2)}`;
}
