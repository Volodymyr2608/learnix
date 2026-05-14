import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	name: string;
	portalUrl: string;
	unsubscribeUrl: string;
};

export function InstructorWelcomeEmail({
	name,
	portalUrl,
	unsubscribeUrl,
}: Props) {
	return (
		<EmailLayout unsubscribeUrl={unsubscribeUrl}>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				Welcome to Learnix, {name}!
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Your instructor account is ready. Head to your portal to create your
				first course and start sharing your knowledge.
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={portalUrl}>Go to Instructor Portal</EmailButton>
			</Section>
		</EmailLayout>
	);
}

InstructorWelcomeEmail.PreviewProps = {
	name: "Ada",
	portalUrl: "https://learnix.app/instructor",
	unsubscribeUrl: "https://learnix.app/unsubscribe?token=demo",
} satisfies Props;

export default InstructorWelcomeEmail;
