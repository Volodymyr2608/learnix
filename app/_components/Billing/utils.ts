/** Shared formatters for the Purchases page and the refund page. */

export const formatAmount = (amountCents: number, currency: string): string =>
	new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountCents / 100);

export const formatDate = (date: Date): string =>
	date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

/** A3: refund deadlines are UTC days, so they are shown as UTC dates in every timezone. */
export const formatUtcDate = (date: Date): string =>
	date.toLocaleDateString("en-GB", {
		timeZone: "UTC",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
