import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "../_shared/EmailLayout";
import type { RefundDoneEmailProps } from "./types";

/** FR-S19 / FR-S21: the refund went through. Fixed wording; no student or Stripe text (C22, C23). */
export const RefundDoneEmail = ({
	name,
	courseTitle,
	amount,
}: RefundDoneEmailProps) => (
	<EmailLayout>
		<Heading style={{ fontSize: 22, color: "#111827" }}>
			Your refund is on its way
		</Heading>
		<Text style={{ color: "#374151", fontSize: 15 }}>
			Hi {name}, we refunded {amount} for <strong>{courseTitle}</strong>. The
			money usually reaches your card in about 5–10 business days. Your access
			to the course and its progress have been closed.
		</Text>
	</EmailLayout>
);

RefundDoneEmail.PreviewProps = {
	name: "Ada",
	courseTitle: "Intro to RAG",
	amount: "$49.00",
} satisfies RefundDoneEmailProps;

export default RefundDoneEmail;
