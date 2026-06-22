import type { StudentPurchase } from "@/server/entities/billing/purchase";

export type BillingListItem = StudentPurchase & {
	invoiceUrl: string;
};

export type BillingHistoryListProps = {
	items: BillingListItem[];
};

export type PurchaseRowProps = {
	item: BillingListItem;
};

export type StatusBadgeProps = {
	status: BillingListItem["status"];
};
