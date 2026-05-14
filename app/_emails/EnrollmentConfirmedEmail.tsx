import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	studentName: string;
	courseTitle: string;
	courseUrl: string;
	unsubscribeUrl: string;
};

export function EnrollmentConfirmedEmail({
	studentName,
	courseTitle,
	courseUrl,
	unsubscribeUrl,
}: Props) {
	return (
		<EmailLayout unsubscribeUrl={unsubscribeUrl}>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				You're enrolled in {courseTitle}!
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Hi {studentName}, you're all set. Jump into your new course whenever
				you're ready.
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={courseUrl}>Start Learning</EmailButton>
			</Section>
		</EmailLayout>
	);
}

EnrollmentConfirmedEmail.PreviewProps = {
	studentName: "Ada",
	courseTitle: "Intro to RAG",
	courseUrl: "https://learnix.app/dashboard/courses/intro-to-rag",
	unsubscribeUrl: "https://learnix.app/unsubscribe?token=demo",
} satisfies Props;

export default EnrollmentConfirmedEmail;
