import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	recipientName: string;
	senderName: string;
	courseTitle: string;
	messagePreview: string;
	threadUrl: string;
	unsubscribeUrl: string;
};

export function MessageNewEmail({
	recipientName,
	senderName,
	courseTitle,
	messagePreview,
	threadUrl,
	unsubscribeUrl,
}: Props) {
	return (
		<EmailLayout unsubscribeUrl={unsubscribeUrl}>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				New message from {senderName}
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Hi {recipientName}, you have a new message about {courseTitle}:
			</Text>
			<Text
				style={{
					color: "#111827",
					fontSize: 15,
					fontStyle: "italic",
					borderLeft: "3px solid #e5e7eb",
					paddingLeft: 12,
				}}
			>
				{messagePreview}
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={threadUrl}>Reply</EmailButton>
			</Section>
		</EmailLayout>
	);
}

MessageNewEmail.PreviewProps = {
	recipientName: "Ada",
	senderName: "Dr Who",
	courseTitle: "React Basics",
	messagePreview: "Great question — take a look at the hooks section…",
	threadUrl: "https://learnix.app/dashboard/messages?c=demo",
	unsubscribeUrl: "https://learnix.app/unsubscribe?token=demo",
} satisfies Props;

export default MessageNewEmail;
