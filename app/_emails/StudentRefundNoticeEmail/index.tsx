import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "../_shared/EmailLayout";
import type { StudentRefundNoticeEmailProps } from "./types";

/**
 * Refund slice 8: the student's appeal decision and lost-dispute notices. The body is fixed text
 * plus, for a denial, the admin's reason (shown to the student anyway, FR-S18) — never Stripe text.
 */
export const StudentRefundNoticeEmail = ({
	name,
	title,
	body,
}: StudentRefundNoticeEmailProps) => (
	<EmailLayout>
		<Heading style={{ fontSize: 22, color: "#111827" }}>{title}</Heading>
		<Text style={{ color: "#374151", fontSize: 15 }}>Hi {name},</Text>
		<Text style={{ color: "#374151", fontSize: 15, whiteSpace: "pre-wrap" }}>
			{body}
		</Text>
	</EmailLayout>
);

StudentRefundNoticeEmail.PreviewProps = {
	name: "Ada",
	title: "Your refund appeal was approved",
	body: "Your appeal for Intro to RAG was approved. We are refunding $49.00.",
} satisfies StudentRefundNoticeEmailProps;

export default StudentRefundNoticeEmail;
