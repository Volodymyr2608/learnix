import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "../_shared/EmailLayout";
import type { RefundDeniedEmailProps } from "./types";

/** FR-S14 / FR-S21: an automatic denial names the condition — a fixed label, never free text. */
export const RefundDeniedEmail = ({
	name,
	courseTitle,
	condition,
}: RefundDeniedEmailProps) => (
	<EmailLayout>
		<Heading style={{ fontSize: 22, color: "#111827" }}>
			Your refund request was not approved
		</Heading>
		<Text style={{ color: "#374151", fontSize: 15 }}>
			Hi {name}, your refund request for <strong>{courseTitle}</strong> was not
			approved automatically: {condition} You can see the details on your
			Purchases page.
		</Text>
	</EmailLayout>
);

RefundDeniedEmail.PreviewProps = {
	name: "Ada",
	courseTitle: "Intro to RAG",
	condition: "The 14-day refund period has ended.",
} satisfies RefundDeniedEmailProps;

export default RefundDeniedEmail;
