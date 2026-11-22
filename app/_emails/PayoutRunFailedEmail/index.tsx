import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "../_shared/EmailButton";
import { EmailLayout } from "../_shared/EmailLayout";
import type { PayoutRunFailedEmailProps } from "./types";

/** FR-A10: a payout run threw — nothing after the failure point was released. */
export const PayoutRunFailedEmail = ({
	runId,
	error,
	startedAt,
	panelUrl,
}: PayoutRunFailedEmailProps) => (
	<EmailLayout>
		<Heading style={{ fontSize: 22, color: "#111827" }}>
			A payout run failed
		</Heading>
		<Text style={{ color: "#374151", fontSize: 15 }}>
			The payout run {runId}, started at {startedAt}, stopped with an error:
		</Text>
		<Text style={{ color: "#991b1b", fontSize: 14, fontFamily: "monospace" }}>
			{error}
		</Text>
		<Text style={{ color: "#374151", fontSize: 15 }}>
			Instructor payouts after the failure point were not released. Check the
			payouts panel and run the job again once the cause is fixed.
		</Text>
		<Section style={{ textAlign: "center", margin: "24px 0" }}>
			<EmailButton href={panelUrl}>Open the payouts panel</EmailButton>
		</Section>
	</EmailLayout>
);

PayoutRunFailedEmail.PreviewProps = {
	runId: "run_1",
	error: "connection lost",
	startedAt: "2026-11-20T03:00:00.000Z",
	panelUrl: "https://learnix.app/admin/payouts",
} satisfies PayoutRunFailedEmailProps;

export default PayoutRunFailedEmail;
