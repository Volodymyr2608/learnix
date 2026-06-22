export function formatInvoiceAmount(
	amountCents: number,
	currency: string,
): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountCents / 100);
}

export function formatInvoiceDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

/** Short, human-readable invoice number derived from the payment id. */
export function invoiceNumber(paymentId: string): string {
	return `INV-${paymentId.slice(-8).toUpperCase()}`;
}
