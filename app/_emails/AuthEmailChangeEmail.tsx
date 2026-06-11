import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	name: string;
	newEmail: string;
	verifyUrl: string;
};

export function AuthEmailChangeEmail({ name, newEmail, verifyUrl }: Props) {
	return (
		<EmailLayout>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				Confirm your email change
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Hi {name}, we received a request to change your Learnix email address to{" "}
				<strong>{newEmail}</strong>. Click the button below to confirm this
				change.
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={verifyUrl}>Confirm Email Change</EmailButton>
			</Section>
			<Text style={{ color: "#6b7280", fontSize: 13 }}>
				If you didn't request this change, you can safely ignore this email.
				This link expires in 24 hours.
			</Text>
		</EmailLayout>
	);
}

AuthEmailChangeEmail.PreviewProps = {
	name: "Ada",
	newEmail: "ada@newdomain.com",
	verifyUrl: "https://learnix.app/api/auth/verify-email?token=demo",
} satisfies Props;

export default AuthEmailChangeEmail;
