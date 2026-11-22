import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { RefundPage } from "@/app/_components/Billing/components/RefundPage";
import { api } from "@/trpc/server";

/** AC-C1, AC-C24: another student's payment, or the flag off, is a plain 404. */
const loadRefundPage = async (paymentId: string) => {
	try {
		return await api.refund.getForPayment({ paymentId });
	} catch (error) {
		if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
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
