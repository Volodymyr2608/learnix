import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	name: string;
	resetUrl: string;
};

export function AuthPasswordResetEmail({ name, resetUrl }: Props) {
	return (
		<EmailLayout>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				Reset your password
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Hi {name}, we received a request to reset your Learnix password. Click
				the button below to choose a new password.
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={resetUrl}>Reset Password</EmailButton>
			</Section>
			<Text style={{ color: "#6b7280", fontSize: 13 }}>
				If you didn't request a password reset, you can safely ignore this email.
				This link expires in 1 hour.
			</Text>
		</EmailLayout>
	);
}

AuthPasswordResetEmail.PreviewProps = {
	name: "Ada",
	resetUrl: "https://learnix.app/api/auth/reset-password?token=demo",
} satisfies Props;

export default AuthPasswordResetEmail;