import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	name: string;
	verifyUrl: string;
};

export function AuthVerifyEmail({ name, verifyUrl }: Props) {
	return (
		<EmailLayout>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				Verify your email address
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Hi {name}, thanks for signing up for Learnix. Click the button below to
				verify your email address.
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={verifyUrl}>Verify Email</EmailButton>
			</Section>
			<Text style={{ color: "#6b7280", fontSize: 13 }}>
				If you didn't create an account, you can safely ignore this email.
			</Text>
		</EmailLayout>
	);
}

AuthVerifyEmail.PreviewProps = {
	name: "Ada",
	verifyUrl: "https://learnix.app/api/auth/verify-email?token=demo",
} satisfies Props;

export default AuthVerifyEmail;