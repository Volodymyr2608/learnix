import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "../_shared/EmailButton";
import { EmailLayout } from "../_shared/EmailLayout";
import type { AdminRefundNoticeEmailProps } from "./types";

/**
 * Refund slice 8: one layout for the admin refund notices (appeal filed or undecided, Dashboard
 * refund, lost dispute). The summary is built from fixed text and ids — never student text (C22).
 */
export const AdminRefundNoticeEmail = ({
	title,
	summary,
	panelUrl,
}: AdminRefundNoticeEmailProps) => (
	<EmailLayout>
		<Heading style={{ fontSize: 22, color: "#111827" }}>{title}</Heading>
		<Text style={{ color: "#374151", fontSize: 15 }}>{summary}</Text>
		<Section style={{ textAlign: "center", margin: "24px 0" }}>
			<EmailButton href={panelUrl}>Open the refunds page</EmailButton>
		</Section>
	</EmailLayout>
);

AdminRefundNoticeEmail.PreviewProps = {
	title: "A refund appeal was filed",
	summary:
		"An appeal for Intro to RAG is waiting for a decision (6 days left).",
	panelUrl: "https://learnix.app/admin/refunds",
} satisfies AdminRefundNoticeEmailProps;

export default AdminRefundNoticeEmail;
