import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "../_shared/EmailButton";
import { EmailLayout } from "../_shared/EmailLayout";
import type { PayoutStaleEmailProps } from "./types";
import { lastSuccessLine } from "./utils";

/** FR-A10: no payout run has succeeded for 48 hours. */
export const PayoutStaleEmail = ({
	lastSuccessAt,
	panelUrl,
}: PayoutStaleEmailProps) => (
	<EmailLayout>
		<Heading style={{ fontSize: 22, color: "#111827" }}>
			Payouts have not run for 48 hours
		</Heading>
		<Text style={{ color: "#374151", fontSize: 15 }}>
			No payout run has succeeded in the last 48 hours.{" "}
			{lastSuccessLine(lastSuccessAt)} Instructors are not being paid, and
			Stripe keeps missed events for only 30 days.
		</Text>
		<Section style={{ textAlign: "center", margin: "24px 0" }}>
			<EmailButton href={panelUrl}>Open the payouts panel</EmailButton>
		</Section>
	</EmailLayout>
);

PayoutStaleEmail.PreviewProps = {
	lastSuccessAt: "2026-11-18T03:00:00.000Z",
	panelUrl: "https://learnix.app/admin/payouts",
} satisfies PayoutStaleEmailProps;

export default PayoutStaleEmail;
