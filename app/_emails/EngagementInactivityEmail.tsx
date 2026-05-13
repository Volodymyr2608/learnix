import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
	studentName: string;
	courseTitle: string;
	nextLessonTitle: string;
	resumeUrl: string;
	progressPct: number;
	unsubscribeUrl: string;
};

export function EngagementInactivityEmail({
	studentName,
	courseTitle,
	nextLessonTitle,
	resumeUrl,
	progressPct,
	unsubscribeUrl,
}: Props) {
	return (
		<EmailLayout unsubscribeUrl={unsubscribeUrl}>
			<Heading style={{ fontSize: 24, color: "#111827" }}>
				Pick up where you left off
			</Heading>
			<Text style={{ color: "#374151", fontSize: 15 }}>
				Hi {studentName}, you're {progressPct}% through{" "}
				<strong>{courseTitle}</strong>. Your next lesson is{" "}
				<em>{nextLessonTitle}</em>. Jump back in!
			</Text>
			<Section style={{ textAlign: "center", margin: "24px 0" }}>
				<EmailButton href={resumeUrl}>Resume Course</EmailButton>
			</Section>
		</EmailLayout>
	);
}

EngagementInactivityEmail.PreviewProps = {
	studentName: "Ada",
	courseTitle: "Intro to RAG",
	nextLessonTitle: "Vector Similarity Search",
	resumeUrl: "https://learnix.app/dashboard/courses/intro-to-rag/lessons/lsn_2",
	progressPct: 42,
	unsubscribeUrl: "https://learnix.app/unsubscribe?token=demo",
} satisfies Props;

export default EngagementInactivityEmail;