import { notFound } from "next/navigation";
import { RefundPage } from "@/app/_components/Billing/components/RefundPage";
import { api } from "@/trpc/server";
import { isRefundPageNotFound } from "./utils";

const loadRefundPage = async (paymentId: string) => {
	try {
		return await api.refund.getForPayment({ paymentId });
	} catch (error) {
		if (isRefundPageNotFound(error)) notFound();
		throw error;
	}
};

const PurchaseRefundPage = async ({
	params,
}: {
	params: Promise<{ paymentId: string }>;
}) => {
	const { paymentId } = await params;
	const result = await loadRefundPage(paymentId);
	if (!result) notFound();

	return (
		<RefundPage
			courseTitle={result.courseTitle}
			paymentId={paymentId}
			state={result.state}
		/>
	);
};

export default PurchaseRefundPage;
