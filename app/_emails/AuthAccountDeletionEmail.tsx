import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	name: string;
	confirmUrl: string;
};

export function AuthAccountDeletionEmail({ name, confirmUrl }: Props) {
	return (
		<EmailLayout>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				Confirm account deletion
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Hi {name}, we received a request to permanently delete your Learnix
				account. Click the button below to confirm. This action cannot be
				undone.
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={confirmUrl}>Delete My Account</EmailButton>
			</Section>
			<Text style={{ color: "#6b7280", fontSize: 13 }}>
				If you didn't request this, you can safely ignore this email and your
				account will remain active. This link expires in 24 hours.
			</Text>
		</EmailLayout>
	);
}

AuthAccountDeletionEmail.PreviewProps = {
	name: "Ada",
	confirmUrl: "https://learnix.app/api/auth/delete-user/callback?token=demo",
} satisfies Props;

export default AuthAccountDeletionEmail;
