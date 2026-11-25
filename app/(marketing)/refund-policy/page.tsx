import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageLayout from "@/app/_components/_shared/components/Layouts/PageLayout";
import { RefundPolicy } from "@/app/_components/RefundPolicy";
import { isStudentRefundEnabled } from "@/server/services/refund/refundFlag";

export const metadata: Metadata = {
	title: "Refund policy",
};

/** Review I4: the page follows the flag at request time, never the build-time value. */
export const dynamic = "force-dynamic";

/** FR-P21: the refund policy; with the student flag off it does not exist (404, C24). */
const RefundPolicyPage = () => {
	if (!isStudentRefundEnabled()) notFound();
	return (
		<PageLayout>
			<RefundPolicy />
		</PageLayout>
	);
};

export default RefundPolicyPage;
