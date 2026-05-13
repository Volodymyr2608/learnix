import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	name: string;
	browseUrl: string;
	unsubscribeUrl: string;
};

export function UserWelcomeEmail({ name, browseUrl, unsubscribeUrl }: Props) {
	return (
		<EmailLayout unsubscribeUrl={unsubscribeUrl}>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				Welcome to Learnix, {name}!
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				You're all set. Browse our course catalogue and start learning at your
				own pace.
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={browseUrl}>Browse Courses</EmailButton>
			</Section>
		</EmailLayout>
	);
}

UserWelcomeEmail.PreviewProps = {
	name: "Ada",
	browseUrl: "https://learnix.app/dashboard/browse",
	unsubscribeUrl: "https://learnix.app/unsubscribe?token=demo",
} satisfies Props;

export default UserWelcomeEmail;
