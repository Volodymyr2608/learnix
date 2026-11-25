import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "../_shared/EmailLayout";
import type { RefundStillProcessingEmailProps } from "./types";

/** FR-A11 / C-TEXT: fixed wording — nothing Stripe said ever reaches the student (C23). */
export const RefundStillProcessingEmail = ({
	name,
	courseTitle,
}: RefundStillProcessingEmailProps) => (
	<EmailLayout>
		<Heading style={{ fontSize: 22, color: "#111827" }}>
			Your refund is still being processed
		</Heading>
		<Text style={{ color: "#374151", fontSize: 15 }}>
			Hi {name}, your refund for <strong>{courseTitle}</strong> was approved and
			is still being processed. We are on it, and your access stays open until
			it completes. We will email you when it does.
		</Text>
	</EmailLayout>
);

RefundStillProcessingEmail.PreviewProps = {
	name: "Ada",
	courseTitle: "Intro to RAG",
} satisfies RefundStillProcessingEmailProps;

export default RefundStillProcessingEmail;
