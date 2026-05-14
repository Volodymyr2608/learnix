import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	studentName: string;
	courseTitle: string;
	lessonsRemaining: number;
	nextLessonUrl: string;
	unsubscribeUrl: string;
};

export function EngagementNearCompletionEmail({
	studentName,
	courseTitle,
	lessonsRemaining,
	nextLessonUrl,
	unsubscribeUrl,
}: Props) {
	return (
		<EmailLayout unsubscribeUrl={unsubscribeUrl}>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				Almost there — {lessonsRemaining} lesson
				{lessonsRemaining !== 1 ? "s" : ""} left!
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Hi {studentName}, you're so close to finishing{" "}
				<strong>{courseTitle}</strong>. Only {lessonsRemaining} lesson
				{lessonsRemaining !== 1 ? "s" : ""} to go. Don't stop now!
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={nextLessonUrl}>Finish Strong</EmailButton>
			</Section>
		</EmailLayout>
	);
}

EngagementNearCompletionEmail.PreviewProps = {
	studentName: "Ada",
	courseTitle: "Intro to RAG",
	lessonsRemaining: 2,
	nextLessonUrl:
		"https://learnix.app/dashboard/courses/intro-to-rag/lessons/lsn_9",
	unsubscribeUrl: "https://learnix.app/unsubscribe?token=demo",
} satisfies Props;

export default EngagementNearCompletionEmail;
