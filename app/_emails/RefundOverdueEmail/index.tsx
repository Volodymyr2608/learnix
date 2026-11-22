import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "../_shared/EmailButton";
import { EmailLayout } from "../_shared/EmailLayout";
import type { RefundOverdueEmailProps } from "./types";

/** FR-A11: an approved refund has not gone through at Stripe for 3 days. */
export const RefundOverdueEmail = ({
	requestId,
	approvedAt,
	panelUrl,
}: RefundOverdueEmailProps) => (
	<EmailLayout>
		<Heading style={{ fontSize: 22, color: "#111827" }}>
			A refund is still processing after 3 days
		</Heading>
		<Text style={{ color: "#374151", fontSize: 15 }}>
			Refund request {requestId}, approved at {approvedAt}, has not succeeded at
			Stripe. The student has been told it is still being processed. Check the
			error on the payouts panel and retry.
		</Text>
		<Section style={{ textAlign: "center", margin: "24px 0" }}>
			<EmailButton href={panelUrl}>Open the payouts panel</EmailButton>
		</Section>
	</EmailLayout>
);

RefundOverdueEmail.PreviewProps = {
	requestId: "req_1",
	approvedAt: "2026-11-17T10:00:00.000Z",
	panelUrl: "https://learnix.app/admin/payouts",
} satisfies RefundOverdueEmailProps;

export default RefundOverdueEmail;
