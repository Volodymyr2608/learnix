import type { StudentPurchase } from "@/server/entities/billing/purchase";

export type BillingListItem = StudentPurchase & {
	invoiceUrl: string;
};

export type BillingHistoryListProps = {
	items: BillingListItem[];
};
