export type StudentPurchase = {
	paymentId: string;
	courseId: string;
	courseTitle: string;
	instructorName: string;
	amountCents: number;
	currency: string;
	status: "succeeded" | "refunded";
	purchasedAt: Date;
	refundedAt: Date | null;
};
