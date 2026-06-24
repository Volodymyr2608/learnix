import { Receipt } from "lucide-react";
import { PageShell } from "@/app/_components/_shared/components/PageShell";
import BillingEmptyState from "@/app/_components/Billing/components/BillingEmptyState";
import BillingHistoryList from "@/app/_components/Billing/components/BillingHistoryList";
import type { BillingListItem } from "@/app/_components/Billing/components/BillingHistoryList/types";
import { env } from "@/lib/env";
import { signInvoiceToken } from "@/server/services/billing/auth";
import { api } from "@/trpc/server";

export default async function BillingPage() {
	const purchases = await api.billing.listPurchases();

	const items: BillingListItem[] = await Promise.all(
		purchases.map(async (purchase) => {
			const token = await signInvoiceToken(purchase.paymentId);
			return {
				...purchase,
				invoiceUrl: `${env.BASE_URL}/api/invoices/${purchase.paymentId}?token=${token}`,
			};
		}),
	);

	return (
		<PageShell
			action={
				items.length > 0 && (
					<span className="hidden shrink-0 rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground text-sm sm:inline-block">
						{items.length} {items.length === 1 ? "purchase" : "purchases"}
					</span>
				)
			}
			description="Your course purchases and downloadable invoices."
			icon={Receipt}
			iconClassName="bg-gradient-to-br from-indigo-500 to-violet-600"
			title="Billing"
		>
			{items.length === 0 && <BillingEmptyState />}
			{items.length > 0 && <BillingHistoryList items={items} />}
		</PageShell>
	);
}
