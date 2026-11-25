export type NeedsReviewItem = {
	paymentId: string;
	courseTitle: string;
	studentName: string;
	amountCents: number;
	currency: string;
	fullyRefunded: boolean;
	flaggedAt: Date | null;
};

export type NeedsReviewListProps = {
	items: NeedsReviewItem[];
};
