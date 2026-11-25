import type { BillingHistoryListProps } from "@/app/_components/Billing/components/BillingHistoryList/types";
import { PurchaseRow } from "./components/PurchaseRow";

const BillingHistoryList = ({ items }: BillingHistoryListProps) => {
	return (
		<div className="space-y-3">
			{items.map((item) => (
				<PurchaseRow item={item} key={item.paymentId} />
			))}
		</div>
	);
};

export default BillingHistoryList;
