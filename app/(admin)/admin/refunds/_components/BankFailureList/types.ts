export type BankFailureItem = {
	paymentId: string;
	courseTitle: string;
	studentName: string;
	amountCents: number;
	currency: string;
	failedAt: Date | null;
};

export type BankFailureListProps = {
	items: BankFailureItem[];
};
