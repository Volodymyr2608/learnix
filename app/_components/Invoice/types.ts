export type InvoiceStatus = "succeeded" | "refunded";

export type InvoiceProps = {
	paymentId: string;
	studentName: string;
	studentEmail: string;
	courseTitle: string;
	amountCents: number;
	currency: string;
	status: InvoiceStatus;
	purchasedAt: Date;
};

export type InvoiceHeaderProps = {
	paymentId: string;
	purchasedAt: Date;
	status: InvoiceStatus;
};

export type InvoiceBodyProps = {
	studentName: string;
	studentEmail: string;
	courseTitle: string;
	amountCents: number;
	currency: string;
	status: InvoiceStatus;
};

export type InvoiceFooterProps = {
	paymentId: string;
};
