import { Document, Page } from "@react-pdf/renderer";
import { CertificateBody } from "./components/CertificateBody";
import { CertificateFooter } from "./components/CertificateFooter";
import { CertificateHeader } from "./components/CertificateHeader";
import { styles } from "./styles";

export type CertificateProps = {
	studentName: string;
	courseTitle: string;
	instructorName: string;
	completedAt: Date;
	enrollmentId: string;
};

export function CertificateDocument(props: CertificateProps) {
	return (
		<Document>
			<Page size="A4" orientation="landscape" style={styles.page}>
				<CertificateHeader />
				<CertificateBody
					studentName={props.studentName}
					courseTitle={props.courseTitle}
					instructorName={props.instructorName}
				/>
				<CertificateFooter
					completedAt={props.completedAt}
					enrollmentId={props.enrollmentId}
				/>
			</Page>
		</Document>
	);
}