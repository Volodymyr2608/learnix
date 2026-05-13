import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	studentName: string;
	courseTitle: string;
	instructorName: string;
	certificatePdfUrl: string;
	unsubscribeUrl: string;
};

export function CourseCertificateEmail({
	studentName,
	courseTitle,
	instructorName,
	certificatePdfUrl,
	unsubscribeUrl,
}: Props) {
	return (
		<EmailLayout unsubscribeUrl={unsubscribeUrl}>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				You completed {courseTitle}!
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Congratulations {studentName}! You've finished{" "}
				<strong>{courseTitle}</strong> taught by {instructorName}. Your
				certificate is ready to download.
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={certificatePdfUrl}>
					Download Your Certificate
				</EmailButton>
			</Section>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Share what you learned and tag us — we love seeing it.
			</Text>
		</EmailLayout>
	);
}

CourseCertificateEmail.PreviewProps = {
	studentName: "Ada",
	courseTitle: "Intro to RAG",
	instructorName: "Alan",
	certificatePdfUrl: "https://learnix.app/api/certificates/enr_demo?token=demo",
	unsubscribeUrl: "https://learnix.app/unsubscribe?token=demo",
} satisfies Props;

export default CourseCertificateEmail;
